import json, os, httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid

from database import db, redis_client
from models import Staff
from rule_engine import assign_staff_to_crisis
from triage import run_triage
from pathfinding import get_evacuation_route
from guardian_mesh import fuse_from_crisis, fuse_signals, record_alert_event

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Firebase is initialized automatically in database.py
    # No SQL tables to create!
    yield
    # Cleanup on shutdown
    pass

app = FastAPI(title="PanicZero Crisis Management API", lifespan=lifespan)

# Allow CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- WebSocket Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # Track active connections in Redis (Deliverable 2)
        await redis_client.incr("active_ws_connections")

    async def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        # Track active connections in Redis (Deliverable 2)
        await redis_client.decr("active_ws_connections")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

# --- Pydantic Models ---
class DetectionData(BaseModel):
    source: str
    location: str
    severity: int
    description: str

class ResolveRequest(BaseModel):
    room: str
    status: str = "Resolved"

class SimulatorTrigger(BaseModel):
    event_type: str
    location: str
    severity: int
    details: str

class GuardianFuseRequest(BaseModel):
    """Direct sensor-fusion request — POST all four signal payloads at once."""
    visual:   Optional[dict] = None   # YOLO camera payload
    acoustic: Optional[dict] = None   # YAMNet / Whisper payload
    motion:   Optional[dict] = None   # Motion / crowd payload
    record_network_event: bool = True

class MapDataSync(BaseModel):
    """Task 3: Model for map data synchronization"""
    rooms: dict
    active_hazards: List[dict]
    suggested_paths: List[List[List[float]]]

# --- Endpoints ---

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")

@app.get("/api/health")
async def health_check():
    """Health check endpoint for mobile app heartbeat."""
    return {"status": "ok"}

async def process_crisis_alert(data: DetectionData, source_type: str):
    crisis_id = f"CRIS-{uuid.uuid4().hex[:6].upper()}"
    
    new_crisis = {
        "id": crisis_id,
        "source": f"{source_type} ({data.source})",
        "location": data.location,
        "severity": data.severity,
        "description": data.description,
        "status": "Active",
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Store in Redis instead of in-memory list (Deliverable 2)
    await redis_client.hset("crises", crisis_id, json.dumps(new_crisis))
    
    # Store permanently in Firebase Firestore for long-term use!
    try:
        db.collection("crises").document(crisis_id).set(new_crisis)
    except Exception as e:
        print(f"Failed to save to Firebase: {e}")
        
    # --- Guardian Mesh: Sensor Fusion Confidence Score ---
    # We run this BEFORE triage so we know the 'threat_type'
    guardian_result = fuse_from_crisis(new_crisis, source_type)
    new_crisis["confidence_score"]  = guardian_result["confidence_score"]
    new_crisis["trigger_emergency"] = guardian_result["trigger_emergency"]
    new_crisis["threat_level"]      = guardian_result["threat_level"]
    new_crisis["threat_type"]       = guardian_result["dominant_threat"]
    

    # --- Deliverable 3: Run the Rule Engine ---
    assigned_staff = await assign_staff_to_crisis(new_crisis)
    if assigned_staff:
        new_crisis["assigned_staff"] = assigned_staff["name"]
        try:
            db.collection("crises").document(crisis_id).update({"assigned_staff": assigned_staff["name"]})
        except Exception:
            pass

    # --- Deliverable 4: Run Dynamic Triage (severity >= 3 triggers hospital selection) ---
    triage_result = None
    if data.severity >= 3:
        triage_input = {
            "location": data.location,
            "severity": data.severity,
            "threat_type": new_crisis["threat_type"],
        }
        triage_result = run_triage(triage_input)
        best = triage_result["best_hospital"]
        new_crisis["hospital"] = best["name"]
        new_crisis["ambulance_eta"] = best["eta_minutes"]

    # Sync all calculated fields back to Firebase in one go
    try:
        db.collection("crises").document(crisis_id).update({
            "threat_type":       new_crisis["threat_type"],
            "confidence_score":  guardian_result["confidence_score"],
            "trigger_emergency": guardian_result["trigger_emergency"],
            "threat_level":      guardian_result["threat_level"],
            "hospital":          new_crisis.get("hospital"),
            "ambulance_eta":     new_crisis.get("ambulance_eta"),
        })
    except Exception:
        pass

    # Broadcast the new crisis to connected WebSocket clients (dashboard)
    await manager.broadcast({
        "event": "NEW_CRISIS",
        "data": new_crisis,
        "guardian": guardian_result,
    })

    response = {"message": f"Crisis detected by {source_type} and logged successfully", "crisis": new_crisis, "guardian": guardian_result}
    if triage_result:
        response["triage"] = triage_result
    return response

@app.post("/api/yolo/detect")
async def yolo_detect(data: DetectionData):
    """
    Receives threat detection alerts specifically from the YOLO Camera AI Model.
    """
    return await process_crisis_alert(data, "Camera AI")

@app.post("/api/audio/detect")
async def audio_detect(data: DetectionData):
    """
    Receives threat detection alerts specifically from the YAMNet Audio AI Model.
    """
    return await process_crisis_alert(data, "Audio AI")

@app.post("/api/crisis/detect")
async def detect_crisis(data: DetectionData):
    """
    General endpoint for detecting a crisis (can be used manually or by other systems).
    """
    return await process_crisis_alert(data, "General System")


@app.get("/api/crisis/active")
async def get_active_crises():
    """
    List ongoing crises (fetches from Redis instead of python list).
    """
    crises_data = await redis_client.hgetall("crises")
    active_crises = []
    
    for crisis_str in crises_data.values():
        crisis = json.loads(crisis_str)
        if crisis.get("status") == "Active":
            active_crises.append(crisis)
            
    return {"crises": active_crises}

@app.post("/api/crisis/resolve")
async def resolve_crisis(req: ResolveRequest):
    """
    Resolves an active crisis based on the room location.
    """
    crises_data = await redis_client.hgetall("crises")
    resolved_id = None
    for cid, cstr in crises_data.items():
        c = json.loads(cstr)
        if c.get("location") == req.room and c.get("status") == "Active":
            c["status"] = req.status
            await redis_client.hset("crises", cid, json.dumps(c))
            db.collection("crises").document(cid).update({"status": req.status})
            resolved_id = cid
            break
    
    return {"message": "Crisis resolved", "id": resolved_id} if resolved_id else {"message": "No active crisis found"}


@app.post("/api/simulator/trigger")
async def trigger_simulator(trigger: SimulatorTrigger):
    """
    For Person 2’s control panel to trigger simulated events.
    """
    event_data = {
        "event_id": f"SIM-{uuid.uuid4().hex[:6].upper()}",
        "event_type": trigger.event_type,
        "location": trigger.location,
        "severity": trigger.severity,
        "details": trigger.details,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Broadcast the simulated event to the dashboard
    await manager.broadcast({
        "event": "SIMULATOR_TRIGGERED",
        "data": event_data
    })
    
    return {"message": "Simulator event triggered", "event": event_data}

@app.post("/api/staff")
async def add_staff(staff_data: Staff):
    """
    Add a staff member to Firestore.
    Required fields: name, role, medical_training, current_zone
    Optional: latitude, longitude, status, fcm_token, experience_years
    """
    staff_dict = staff_data.model_dump()
    doc_ref = db.collection("staff").add(staff_dict)
    return {
        "message": "Staff member added to Firebase.",
        "firebase_document_id": doc_ref[1].id,
        "data_added": staff_dict
    }


@app.get("/api/staff")
async def list_staff():
    """
    Returns all staff members from Firestore with their current status.
    """
    staff_docs = db.collection("staff").stream()
    all_staff = []
    for doc in staff_docs:
        s = doc.to_dict()
        s["id"] = doc.id
        all_staff.append(s)
    return {"staff": all_staff, "total": len(all_staff)}


@app.post("/api/triage")
async def manual_triage(data: DetectionData):
    """
    Run Dynamic Triage manually for any crisis description.
    Returns best hospital + ambulance dispatch info.
    Useful for testing or manual override.
    """
    triage_input = {
        "location": data.location,
        "severity": data.severity,
        "description": data.description,
        "threat_type": "GENERAL",  # rule engine not called here, use description
    }
    # Quick threat classification from description
    desc = data.description.lower()
    if any(w in desc for w in ["fire", "smoke", "flame"]):
        triage_input["threat_type"] = "FIRE"
    elif any(w in desc for w in ["medical", "fall", "unconscious", "help", "chest", "seizure"]):
        triage_input["threat_type"] = "MEDICAL"
    elif any(w in desc for w in ["violence", "weapon", "knife", "gun", "fight"]):
        triage_input["threat_type"] = "VIOLENCE"

    result = run_triage(triage_input)
    return result


@app.post("/api/route")
async def compute_evacuation_route(data: dict):
    """
    A* Pathfinding — Compute safest evacuation route.

    Request body:
        start_room   (str): Room where the incident/person is located
        hazard_rooms (list): Rooms to avoid e.g. ["Kitchen", "Corridor_2"]
        crisis_type  (str): "FIRE" | "MEDICAL" | "VIOLENCE" | "GAS" | "GENERAL"
        goal         (str, optional): Destination room (default: "Main_Exit")

    Returns:
        route_nodes  : ordered list of room name strings
        coordinates  : ordered list of [x, y, z] — ready to render in Three.js
        distance     : total path length in 3D units
        lift_used    : whether the lift is on the route
        blocked_zones: rooms that were avoided
    """
    start_room   = data.get("start_room", "Lobby")
    hazard_rooms = data.get("hazard_rooms", [])
    crisis_type  = data.get("crisis_type", "GENERAL")
    goal         = data.get("goal", "Main_Exit")

    result = get_evacuation_route(
        start_room=start_room,
        hazard_rooms=hazard_rooms,
        crisis_type=crisis_type,
        goal=goal,
    )
    return result


@app.post("/api/crisis/route")
async def get_mobile_evacuation_route(data: dict):
    """
    Mobile-friendly Evacuation Route Endpoint
    Expects {"current_location": "Room 302"}
    """
    current_location = data.get("current_location", "Lobby")
    
    # Strip "Room " if present to match the pathfinding graph nodes
    start_room = current_location.replace("Room ", "").strip()
    
    # Query pathfinding (assume no hazards and type FIRE for demo)
    result = get_evacuation_route(
        start_room=start_room,
        hazard_rooms=[],
        crisis_type="FIRE",
        goal="Main_Exit"
    )
    
    steps = []
    if result.get("found", False):
        nodes = result.get("route_nodes", [])
        for i, node in enumerate(nodes):
            action = "straight"
            instruction = f"Proceed to {node}"
            
            # Basic heuristics for mobile app actions:
            if i == len(nodes) - 1:
                action = "arrive"
                instruction = f"You have safely arrived at {node}."
            elif "Stair" in node:
                action = "straight"
                instruction = f"Go straight down the stairs ({node})."
            elif "Corridor" in node:
                action = "straight"
                instruction = "Head down the corridor."
            elif i > 0 and "Lift" not in node and "Stair" not in node and "Corridor" not in node:
                action = "left" if i % 2 == 0 else "right" # pseudo-random turns for demo
                instruction = f"Turn {action} into {node}."
                
            # Formatting the node name for human-readable
            location_name = node
            if node.isdigit() and len(node) >= 3:
                location_name = f"Room {node}"
            
            steps.append({
                "step_index": i,
                "location_name": location_name,
                "action": action,
                "instruction": instruction
            })

    return {
        "route_id": f"route_{start_room}",
        "steps": steps,
        "status": "success" if result.get("found") else "failed",
        "estimated_time_seconds": len(steps) * 15 # Mock time: 15s per node
    }


@app.post("/api/guardian/fuse")
async def guardian_fuse(req: GuardianFuseRequest):
    """
    Guardian Mesh Confidence Calculator — direct sensor-fusion endpoint.

    POST all four signal payloads at once to get a unified confidence score
    and trigger_emergency decision without going through the full crisis pipeline.

    Payload example:
    {
      "visual":   { "confidence": 0.92, "description": "fire detected", "severity": 4 },
      "acoustic": { "confidence": 0.88, "description": "smoke alarm",   "severity": 4 },
      "motion":   { "fallen_detected": false, "crowd_surge": false, "person_count": 2 },
      "record_network_event": true
    }
    """
    result = fuse_signals(
        visual_payload=req.visual,
        acoustic_payload=req.acoustic,
        motion_payload=req.motion,
        record_network_event=req.record_network_event,
    )
    # Broadcast to dashboard if it's an emergency
    if result["trigger_emergency"]:
        await manager.broadcast({
            "event": "GUARDIAN_EMERGENCY",
            "data":  result,
        })
    return result

@app.post("/api/crisis/map")
async def sync_map_data(data: MapDataSync):
    """Receives and stores the current dashboard map state for the mobile app."""
    await redis_client.set("latest_map_data", data.model_dump_json())
    return {"status": "Map data synchronized"}

@app.get("/api/crisis/map")
async def get_map_data():
    """Endpoint for the mobile app to fetch the latest floorplan and hazards."""
    data = await redis_client.get("latest_map_data")
    if not data:
        return {
            "rooms": {},
            "active_hazards": [],
            "suggested_paths": []
        }
    return json.loads(data)

@app.post("/api/staff/reset")
async def reset_staff_status():
    """
    Resets all staff members to 'Available'.
    Useful for testing or shift changeovers.
    """
    staff_docs = db.collection("staff").stream()
    reset_count = 0
    for doc in staff_docs:
        db.collection("staff").document(doc.id).update({
            "status": "Available",
            "assigned_crisis": None,
            "assigned_at": None,
        })
        reset_count += 1
    return {"message": f"Reset {reset_count} staff members to Available."}

MODEL_DIR = "./saved_models"
if not os.path.exists(MODEL_DIR): os.makedirs(MODEL_DIR)

@app.get("/api/models")
async def list_models():
    return {"models": [f for f in os.listdir(MODEL_DIR) if f.endswith('.json')]}

@app.post("/api/models/save")
async def save_model(request: Request):
    data = await request.json()
    with open(os.path.join(MODEL_DIR, f"{data['name']}.json"), 'w') as f:
        json.dump(data, f)
    return {"status": "saved"}

@app.get("/api/models/load/{filename}")
async def load_model(filename: str):
    with open(os.path.join(MODEL_DIR, filename), 'r') as f:
        return json.load(f)
    
@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    """
    WebSocket server for real-time dashboard updates.
    """
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
