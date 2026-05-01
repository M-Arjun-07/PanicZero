# PanicZero — Crisis Management System

> Real-time AI-powered crisis detection, staff assignment, hospital triage, and evacuation routing for buildings.

---

## Architecture

```tree
AI Camera (YOLO)  ──┐
AI Microphone      ──┼──► FastAPI Backend ──► Firestore DB
Manual Trigger     ──┘         │
                               ├── Rule Engine      (auto staff assignment + FCM push)
                               ├── Triage Engine    (best hospital selection + ambulance)
                               ├── A* Pathfinding   (evacuation route coordinates)
                               └── WebSocket        (real-time dashboard updates)
                                        │
                               React 3D Dashboard (Three.js)
```

---

## Quick Start (Local)

```bash
# 1. Start the backend
cd backend
python main.py
# → Running at http://127.0.0.1:8000

# 2. Start the frontend (separate terminal)
cd crisis-app
npm install
npm run dev
# → Running at http://localhost:5173
```

---

## Quick Start (Docker)

```bash
# From the project root
docker-compose up --build

# Backend:  http://localhost:8000
# Frontend: http://localhost:5173
```

To enable real FCM push notifications:

```bash
PANIC_FCM_SERVER_KEY=your-key-here docker-compose up
```

---

## API Reference

**Base URL:** `http://127.0.0.1:8000`  
**Interactive Docs:** `http://127.0.0.1:8000/docs`

---

### 🚨 Crisis Detection

#### `POST /api/crisis/detect`

General crisis detection endpoint. Triggers rule engine + triage automatically.

**Request:**

```json
{
  "source": "Camera-01",
  "location": "Kitchen",
  "severity": 4,
  "description": "Smoke detected near electrical panel"
}
```

**Response:**

```json
{
  "message": "Crisis detected by General System and logged successfully",
  "crisis": {
    "id": "CRIS-AB12CD",
    "source": "General System (Camera-01)",
    "location": "Kitchen",
    "severity": 4,
    "description": "Smoke detected near electrical panel",
    "status": "Active",
    "timestamp": "2026-04-26T10:00:00",
    "assigned_staff": "Arjun Sharma",
    "hospital": "City General Hospital",
    "ambulance_eta": 4.2
  },
  "triage": { ... }
}
```

#### `POST /api/yolo/detect`

Same as above but tagged as "Camera AI" source. For Person 1's YOLO model.

#### `POST /api/audio/detect`

Same as above but tagged as "Audio AI" source. For Person 1's YAMNet model.

---

### 🏥 Triage

#### `POST /api/triage`

Manually run hospital triage for any crisis. Returns scored hospital list + ambulance dispatch.

**Request:**

```json
{
  "source": "manual",
  "location": "Main Hall",
  "severity": 5,
  "description": "Person unconscious, possible cardiac arrest"
}
```

**Response:**

```json
{
  "best_hospital": {
    "name": "City General Hospital",
    "address": "12 MG Road, Bangalore",
    "available_beds": 45,
    "specialists": ["Trauma", "Cardiology"],
    "distance_km": 0.07,
    "eta_minutes": 4.2,
    "score": -171.4
  },
  "all_scores": [ ... ],
  "ambulance_dispatch": {
    "dispatch_id": "AMB-95046",
    "unit": "Ambulance Unit #08",
    "status": "DISPATCHED",
    "eta_minutes": 4.2
  }
}
```

---

### 🗺️ Pathfinding (A*)

#### `POST /api/route`

Compute optimal evacuation route through the building, avoiding hazard zones.
Returns `coordinates` as `[x, y, z]` arrays ready to render in Three.js.

**Request:**

```json
{
  "start_room": "408",
  "hazard_rooms": ["Kitchen", "Corridor_1"],
  "crisis_type": "FIRE",
  "goal": "Main_Exit"
}
```

**Response:**

```json
{
  "found": true,
  "route_nodes": ["408", "Corridor_4", "StairA_F4", "StairA_F3", "StairA_F2", "StairA_F1", "StairA_F0", "Lobby", "Main_Exit"],
  "coordinates": [
    [9, 14.0, 4],
    [0, 14.0, 0],
    [-14, 14.0, 0],
    ...
  ],
  "distance": 56.41,
  "lift_used": false,
  "blocked_zones": ["Kitchen", "Corridor_1"],
  "node_count": 9
}
```

**Crisis types:** `FIRE` | `MEDICAL` | `VIOLENCE` | `GAS` | `GENERAL`  
> Note: `FIRE` and `VIOLENCE` automatically disable lift usage.

**Valid room IDs:**

- Ground floor: `Lobby`, `Restaurant`, `Kitchen`, `Security`, `Utility`
- Guest rooms: `101`–`408` (floor + 01–08)
- Corridors: `Corridor_1` – `Corridor_4`
- Stairs: `StairA_F0` – `StairA_F4`, `StairB_F0` – `StairB_F4`
- Lifts: `Lift_F0` – `Lift_F4`
- Exit: `Main_Exit`

---

### 👥 Staff Management

#### `POST /api/staff`

Add a staff member to Firestore.

**Request:**

```json
{
  "name": "Arjun Sharma",
  "role": "Security",
  "medical_training": "Basic",
  "current_zone": "Main Hall",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "status": "Available",
  "fcm_token": "device-fcm-token-here",
  "experience_years": 5
}
```

**Roles:** `Security` | `Medical` | `Fire Warden` | `Manager` | `First Responder` | `Nurse` | `Doctor`  
**Medical Training:** `None` | `Basic` | `Advanced`  
**Status:** `Available` | `Busy` | `Off Duty`

#### `GET /api/staff`

List all staff with their current status.

#### `POST /api/staff/reset`

Reset all staff to `Available`. Useful for testing or shift changeovers.

---

### 📊 Active Crises

#### `GET /api/crisis/active`

Returns all currently active crises from Redis cache.

---

### 🎮 Simulator

#### `POST /api/simulator/trigger`

Trigger a simulated event (for Person 2's control panel). Broadcasts via WebSocket.

**Request:**

```json
{
  "event_type": "fire",
  "location": "Kitchen",
  "severity": 4,
  "details": "Kitchen fire simulation"
}
```

---

### 📡 WebSocket

#### `WS /ws/dashboard`

Real-time event stream for the dashboard.

**Connect:** `ws://127.0.0.1:8000/ws/dashboard`

**Events received:**

```json
{ "event": "NEW_CRISIS",          "data": { ...crisis object... } }
{ "event": "SIMULATOR_TRIGGERED", "data": { ...event object... } }
```

---

## Environment Variables

| Variable | Required | Description |

|---|---|---|
| `PANIC_FCM_SERVER_KEY` | No | FCM server key from Firebase Console. Without this, push notifications run in mock/log mode. |

---

## Dependencies (Person Assignments)

| # | Dependency | From | Status |

|---|---|---|---|

| 1 | Detection data format | Person 1 (YOLO/Audio AI) | ✅ Integrated — use `/api/yolo/detect` or `/api/audio/detect` |
| 2 | FCM Server Key | Person 4 | ⚠️ Set `PANIC_FCM_SERVER_KEY` env var when received |
| 3 | WebSocket client | Person 2 | ✅ Connect to `ws://127.0.0.1:8000/ws/dashboard` |

---

## File Structure

```cmd
backend/
├── main.py           ← FastAPI app, all endpoints, WebSocket manager
├── rule_engine.py    ← Auto staff assignment, FCM push, threat matrix
├── triage.py         ← Hospital scoring (Swiggy logic), ambulance dispatch
├── pathfinding.py    ← A* evacuation routing, building graph
├── database.py       ← Firebase + FakeRedis setup
├── models.py         ← Pydantic data models
├── requirements.txt  ← Python dependencies
└── Dockerfile        ← Container definition
```

## Contributors

| Member | Role | Key Contributions | GitHub |

| :--- | :--- | :--- | :--- |

| **Hariram S** | **Frontend & Dashboard Lead** | Developed the 3D Digital Twin using React Three Fiber, implemented cinematic camera "fly-to" logic, and managed frontend-backend integration. | [GitHub](https://github.com/UdontKnowMe-git) |

| **M Arjun** | **AI & Systems Architect** | [cite_start]Designed the initial project framework and developed the YOLO-based visual detection and audio analysis models for crisis identification[cite: 308]. | [GitHub](https://github.com/M-Arjun-07) |

| **CV Vignesh** | **Mobile Lead** | [cite_start]Developed the Flutter-based mobile application, including haptic feedback systems and the emergency responder interface[cite: 245, 308]. | [GitHub](https://github.com/CV-Vignesh) |

| **Krish** | **Backend & API Lead** | [cite_start]Engineered the FastAPI backend, integrated Firebase/Firestore, and established the WebSocket infrastructure for real-time data broadcasting[cite: 194, 298, 308]. | [GitHub](https://github.com/syntaxerror0106) |
