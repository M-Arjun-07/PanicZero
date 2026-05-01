import os

API_ENDPOINT = os.getenv("API_ENDPOINT", "http://localhost:8000/api/audio/detect")
COOLDOWN_SECONDS = 10
CONFIDENCE_THRESHOLD = 0.40

# Map YAMNet class keywords (case-insensitive) to CrisisMesh system types
# If a class name contains one of these keywords, it will be mapped to the corresponding type.
THREAT_KEYWORDS = {
    "glass": "violence", 
    "shatter": "violence",
    "scream": "violence",
    "yell": "violence",
    "crash": "violence",
    "smash": "violence",
    "impact": "violence",
    "gunshot": "violence",
    "explosion": "violence"
}

PHRASE_KEYWORDS = {
    "help": "medical",
    "help me": "medical",
    "save me": "violence",
    "fire": "fire",
    "smoke": "fire",
    "gun": "violence",
    "knife": "violence",
    "stop": "violence",
    "leave me": "violence"
}

# The sensor ID/room identifier for this edge device
SENSOR_ROOM_ID = "Lobby_Audio_Sensor"
DEFAULT_ROUTE = ["Lobby_Audio_Sensor", "Main_Exit"]
