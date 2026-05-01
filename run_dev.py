import subprocess
import os
import time
import sys

def start_services():
    # Detect the directory where this script is currently located
    # This makes it portable for all teammates
    base_path = os.path.dirname(os.path.abspath(__file__))
    
    backend_path = os.path.join(base_path, "backend")
    frontend_path = os.path.join(base_path, "crisis-app")

    print("🚀 Starting PanicZero Development Environment...")
    print(f"📍 Detected Project Root: {base_path}")

    # 1. Start the FastAPI Backend
    if os.path.exists(backend_path):
        print("--- Starting Backend (FastAPI) on port 8000 ---")
        subprocess.Popen(
            ["cmd", "/c", "start", "cmd", "/k", f"cd /d {backend_path} && python main.py"],
            shell=True
        )
    else:
        print(f"❌ Error: Backend folder not found at {backend_path}")

    # Wait a moment for the backend to initialize
    time.sleep(3)

    # 2. Start the React Frontend
    if os.path.exists(frontend_path):
        print("--- Starting Frontend (Vite/React) on port 5173 ---")
        subprocess.Popen(
            ["cmd", "/c", "start", "cmd", "/k", f"cd /d {frontend_path} && npm run dev"],
            shell=True
        )
    else:
        print(f"❌ Error: Frontend folder not found at {frontend_path}")

    print("\n✅ Service launch commands sent.")
    print("🔗 Dashboard: http://localhost:5173")

if __name__ == "__main__":
    start_services()