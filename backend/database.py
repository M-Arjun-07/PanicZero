import firebase_admin
from firebase_admin import credentials, firestore
import fakeredis.aioredis
import os
import json

# Initialize Firebase Admin SDK
# Supports two modes:
#   1. Cloud (Render): set FIREBASE_CREDENTIALS_JSON env var to the full JSON string
#   2. Local dev:      place firebase-credentials.json in the backend folder
if not firebase_admin._apps:
    try:
        firebase_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
        if firebase_json:
            # Cloud deployment — load credentials from environment variable
            cred_dict = json.loads(firebase_json)
            cred = credentials.Certificate(cred_dict)
            print("Firebase Admin SDK initialized from environment variable.")
        else:
            # Local development — load from file
            cred_path = os.path.join(os.path.dirname(__file__), "firebase-credentials.json")
            cred = credentials.Certificate(cred_path)
            print("Firebase Admin SDK initialized from firebase-credentials.json.")
        firebase_admin.initialize_app(cred)
    except Exception as e:
        print(f"Error initializing Firebase: {e}")

# Get the Firestore database client
db = firestore.client()

# FakeRedis — lightweight in-process Redis for both local and cloud (no Redis server needed)
redis_client = fakeredis.aioredis.FakeRedis(decode_responses=True)
