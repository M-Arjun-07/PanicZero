# API settings
API_ENDPOINT = "http://localhost:8000/api/yolo/detect"

# Cooldown in seconds to prevent spamming the backend
ALERT_COOLDOWN = 10

# Threat detection thresholds
CROWD_SURGE_THRESHOLD = 10
FALLEN_PERSON_RATIO = 0.6  # If height / width < 0.6, classify as fallen

# Camera identifier
CAMERA_NAME = "Lobby_Camera_1"
