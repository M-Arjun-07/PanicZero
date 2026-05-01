import cv2
import time
import requests
import json
import threading
import numpy as np
from ultralytics import YOLO
import config

# Load YOLOv8 nano model for maximum speed
model = YOLO('yolov8n.pt')

# Cooldown tracking dictionary
last_alert_time = {
    "fire": 0,
    "weapon": 0,
    "medical": 0,
    "violence": 0
}

GUARDIAN_ENDPOINT = config.API_ENDPOINT.replace("/api/yolo/detect", "/api/guardian/fuse")

def _send_alert_worker(alert_type, conf=0.0, motion_info=None):
    # Construct the payload according to FastAPI DetectionData schema
    severity_map = {"fire": 5, "weapon": 5, "medical": 3, "violence": 4}
    payload = {
        "source": "Camera",
        "location": config.CAMERA_NAME,
        "severity": severity_map.get(alert_type, 3),
        "description": f"AI Camera detected {alert_type}"
    }

    try:
        # Send POST request, timeout included to prevent hanging if backend is down
        response = requests.post(config.API_ENDPOINT, json=payload, timeout=2)
        print(f"[ALERT SENT] Type: {alert_type}, Status: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"[NETWORK ERROR] Could not send alert for {alert_type}. Is the backend running? Error: {e}")

    # ── Guardian Mesh: send richer sensor signals ──────────────────────────────
    motion_info = motion_info or {}
    guardian_payload = {
        "visual": {
            "confidence":     conf,
            "description":    f"AI Camera detected {alert_type}",
            "severity":       severity_map.get(alert_type, 3),
            "detected_class": alert_type,
        },
        "motion": {
            "fallen_detected":   motion_info.get("fallen_detected", False),
            "crowd_surge":       motion_info.get("crowd_surge", False),
            "person_count":      motion_info.get("person_count", 0),
            "crowd_surge_count": motion_info.get("person_count", 0),
            "crowd_threshold":   getattr(config, "CROWD_SURGE_THRESHOLD", 10),
        },
        "record_network_event": True,
    }
    try:
        requests.post(GUARDIAN_ENDPOINT, json=guardian_payload, timeout=2)
    except requests.exceptions.RequestException:
        pass  # Guardian Mesh is best-effort; don't block on failure

def send_alert(alert_type, conf=0.0, motion_info=None):
    """
    Sends an alert to the backend API if the cooldown period has elapsed.
    Also dispatches enriched signals to the Guardian Mesh Confidence Calculator.
    """
    current_time = time.time()
    
    # Check cooldown
    if current_time - last_alert_time.get(alert_type, 0) < config.ALERT_COOLDOWN:
        return # Cooldown active, do not spam

    # Set cooldown immediately to avoid duplicate requests while waiting for response
    last_alert_time[alert_type] = current_time

    # Spawn thread to send alert without blocking the main loop
    threading.Thread(target=_send_alert_worker, args=(alert_type, conf, motion_info), daemon=True).start()

def main():
    camera_index = 0
    cap = cv2.VideoCapture(camera_index)

    print("Starting AI Camera Threat Detection...")
    print("Press 'q' to quit. Press 'f' to trigger mock fire alert.")

    # Create a named window so we can attach a trackbar UI to it
    window_name = "CrisisMesh - AI Threat Detection"
    cv2.namedWindow(window_name)
    
    # UI Element: Trackbar to toggle camera IDs (0 through 4)
    cv2.createTrackbar("Camera ID", window_name, camera_index, 4, lambda x: None)

    while True:
        # Safely check if the user clicked the 'X' button to close the window
        try:
            if cv2.getWindowProperty(window_name, cv2.WND_PROP_AUTOSIZE) < 0:
                break
        except cv2.error:
            break

        # --- UI Toggling Logic ---
        # Read current trackbar value
        ui_cam_id = cv2.getTrackbarPos("Camera ID", window_name)
        if ui_cam_id != camera_index:
            print(f"Switching camera to index {ui_cam_id}...")
            cap.release() # Release previous camera
            camera_index = ui_cam_id
            cap = cv2.VideoCapture(camera_index) # Open new camera
            if not cap.isOpened():
                print(f"Warning: Could not open camera {camera_index}.")

        ret, frame = False, None
        if cap.isOpened():
            ret, frame = cap.read()

        person_count = 0

        # If camera read is successful, run YOLO
        if ret and frame is not None:
            # Run YOLOv8 inference on the current frame
            results = model(frame, stream=True, verbose=False)

            for r in results:
                boxes = r.boxes
                for box in boxes:
                    # Get bounding box coordinates, class id, and confidence score
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    cls = int(box.cls[0])
                    conf = float(box.conf[0])
                    
                    # Defaults
                    color = (0, 255, 0)
                    label = ""

                    # ----------------------------------------------------
                    # THREAT 1 & 2: FALLEN PERSON (Medical) & CROWD SURGE
                    # ----------------------------------------------------
                    if cls == 0:  # Class 0 is 'person' in COCO dataset
                        person_count += 1
                        
                        # Aspect Ratio calculation for fallen person detection:
                        width = x2 - x1
                        height = y2 - y1
                        
                        if width > 0:
                            aspect_ratio = height / width
                            if aspect_ratio < config.FALLEN_PERSON_RATIO:
                                label = "Fallen Person"
                                color = (0, 0, 255) # Red for danger
                                send_alert("medical", conf=conf, motion_info={
                                    "fallen_detected": True,
                                    "crowd_surge": False,
                                    "person_count": person_count,
                                })
                            else:
                                label = "Person"
                    
                    # ----------------------------------------------------
                    # THREAT 3: WEAPONS (Violence)
                    # ----------------------------------------------------
                    elif cls == 42: # Class 42 is 'knife' in COCO dataset
                        label = "Weapon (Knife)"
                        color = (0, 0, 255) # Red
                        send_alert("violence", conf=conf, motion_info={
                            "fallen_detected": False,
                            "crowd_surge": False,
                            "person_count": person_count,
                        })
                    
                    # Draw the bounding box and label if it's a person or threat
                    if label:
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(frame, f"{label} {conf:.2f}", (max(0, x1), max(0, y1 - 10)), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

            # ----------------------------------------------------
            # THREAT 2 (Cont.): CROWD SURGE (Violence)
            # ----------------------------------------------------
            if person_count > config.CROWD_SURGE_THRESHOLD:
                cv2.putText(frame, f"CROWD SURGE DETECTED ({person_count} people)", (50, 50), 
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3)
                send_alert("violence", conf=0.85, motion_info={
                    "fallen_detected": False,
                    "crowd_surge": True,
                    "person_count": person_count,
                })
        else:
            # Camera unavailable: Display a black frame with a warning
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, f"Camera {camera_index} Unavailable", (150, 240), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            cv2.putText(frame, "Use the trackbar to switch cameras", (120, 280), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1)

        # Display the resulting frame
        cv2.imshow(window_name, frame)

        # Handle key presses
        key = cv2.waitKey(1) & 0xFF
        
        # Quit
        if key == ord('q'):
            break
            
        # ----------------------------------------------------
        # THREAT 4: FIRE DETECTION (Mock logic via keypress)
        # ----------------------------------------------------
        elif key == ord('f'):
            print("Mock Fire Detected!")
            # Show a visual indicator on screen
            cv2.putText(frame, "FIRE DETECTED", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 165, 255), 3)
            cv2.imshow(window_name, frame)
            cv2.waitKey(1) # Brief pause to update frame visually
            send_alert("fire")

    # Clean up
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
