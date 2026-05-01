import os
import time
import argparse
import urllib.request
import csv
import json
import whisper
import numpy as np
import requests
import queue
import sys

PHRASE_KEYWORDS = {
    "help": "medical",
    "help me": "medical",
    "save me": "violence",
    "fire": "fire",
    "smoke": "fire",
    "thief": "violence",
    "gun": "violence",
    "knife": "violence",
    "stop": "violence",
    "leave me": "violence",
    "kill": "violence",
    "rape": "violence",
    "attack": "violence",
    "police": "violence",
    "Help Help": "medical",
    "Help me I'm being attacked": "violence",
    "Someone help me": "medical",
    "bleeding": "medical",
    "I can't breathe": "medical",
    "I'm having a heart attack": "medical",
    "I'm having a stroke": "medical",
    "I'm having a seizure": "medical",
    "Help I fell and I can't get up!": "medical",
    "Emergency": "medical",
    "Medicine": "medical",
    "Ambulance": "medical",
    "Call the police": "violence",
}

try:
    import tensorflow as tf
except ImportError:
    print("TensorFlow not found. Please pip install tensorflow.")
    sys.exit(1)

try:
    import sounddevice as sd
except ImportError:
    print("sounddevice not found. Please pip install sounddevice.")
    sys.exit(1)

from scipy.io import wavfile

from config import (
    API_ENDPOINT, COOLDOWN_SECONDS, CONFIDENCE_THRESHOLD,
    THREAT_KEYWORDS, SENSOR_ROOM_ID, DEFAULT_ROUTE
)

# Guardian Mesh endpoint (derived from the base API endpoint)
_base_url = API_ENDPOINT.rsplit("/", 2)[0]  # strip /api/audio/detect → http://host:port
GUARDIAN_ENDPOINT = f"{_base_url}/api/guardian/fuse"

YAMNET_MODEL_URL = "https://tfhub.dev/google/lite-model/yamnet/classification/tflite/1?lite-format=tflite"
YAMNET_CLASS_MAP_URL = "https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv"

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(MODEL_DIR, "yamnet.tflite")
CLASS_MAP_PATH = os.path.join(MODEL_DIR, "yamnet_class_map.csv")

SAMPLE_RATE = 16000  # YAMNet requires 16 kHz
CHUNK_DURATION = 3 # Process in 0.975 second chunks (exactly 15600 samples for YAMNet)

def download_file(url, dest_path):
    if not os.path.exists(dest_path):
        print(f"\033[93m[DOWNLOAD] Downloading {os.path.basename(dest_path)}...\033[0m")
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
                data = response.read()
                out_file.write(data)
            print(f"\033[92m[DOWNLOAD] Successfully downloaded {os.path.basename(dest_path)}.\033[0m")
        except Exception as e:
            print(f"\033[91m[ERROR] Failed to download {url}: {e}\033[0m")
            sys.exit(1)

def load_class_names(csv_path):
    class_names = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader) # skip header
        for row in reader:
            class_names.append(row[2])
    return class_names

def trigger_alert(threat_type, class_name, confidence):
    print(f"\033[91m\n[THREAT DETECTED] => {class_name} (Confidence: {confidence:.2f}) -> Triggering {threat_type.upper()} Alert!\033[0m")
    # Construct the payload according to FastAPI DetectionData schema
    severity_map = {"fire": 5, "medical": 3, "violence": 4}
    payload = {
        "source": "Audio",
        "location": str(SENSOR_ROOM_ID),
        "severity": int(severity_map.get(threat_type, 3)),   # explicit int — guards against numpy int types
        "description": f"Audio Sensor detected {class_name} ({threat_type})"
    }
    try:
        response = requests.post(API_ENDPOINT, json=payload, timeout=2)
        if response.status_code == 200:
            print(f"\033[92m[API SUCCESS] Alert sent to backend successfully.\033[0m")
        else:
            # Print full error body so we can debug 422 / other errors
            print(f"\033[93m[API WARN] Backend responded with {response.status_code}: {response.text}\033[0m")
    except requests.exceptions.RequestException as e:
        print(f"\033[91m[API ERROR] Could not connect to backend: {e}\033[0m")

    # ── Guardian Mesh: send acoustic signal ───────────────────────────────
    guardian_payload = {
        "acoustic": {
            "confidence":   float(confidence),
            "description":  f"Audio Sensor detected {class_name} ({threat_type})",
            "severity":     severity_map.get(threat_type, 3),
            "threat_type":  threat_type,
        },
        "record_network_event": True,
    }
    try:
        requests.post(GUARDIAN_ENDPOINT, json=guardian_payload, timeout=2)
    except requests.exceptions.RequestException:
        pass  # Guardian Mesh is best-effort; don't block on failure

def map_class_to_threat(class_name):
    lower_name = class_name.lower()
    for keyword, threat_type in THREAT_KEYWORDS.items():
        if keyword in lower_name:
            return threat_type
    return None

def main():
    parser = argparse.ArgumentParser(description="YAMNet Audio Anomaly Detection")
    parser.add_argument("--source", type=str, default="mic", help="Source: 'mic' or path to a .wav file")
    args = parser.parse_args()

    # 1. Download models if missing
    download_file(YAMNET_MODEL_URL, MODEL_PATH)
    download_file(YAMNET_CLASS_MAP_URL, CLASS_MAP_PATH)

    # 2. Load TFLite Model
    print("\033[94m[INIT] Loading YAMNet TFLite model...\033[0m")
    interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    
    waveform_input_index = input_details[0]['index']
    scores_output_index = output_details[0]['index']

    # 3. Load class names
    class_names = load_class_names(CLASS_MAP_PATH)
    print(f"\033[94m[INIT] Loaded {len(class_names)} YAMNet classes.\033[0m")

    last_alert_time = 0.0
    print("\033[94m[INIT] Loading Whisper...\033[0m")
    whisper_model = whisper.load_model("tiny")

    def process_audio_chunk(waveform):
        nonlocal last_alert_time
        # Ensure waveform is 1D float32 array in range [-1.0, 1.0]
        if waveform.dtype != np.float32:
            # If int16, normalize to float32
            if waveform.dtype == np.int16:
                waveform = waveform.astype(np.float32) / 32768.0
            else:
                waveform = waveform.astype(np.float32)
        
        # Flatten if it's 2D (mono)
        if waveform.ndim > 1:
            waveform = np.mean(waveform, axis=1) # mix down to mono if stereo
            
        waveform = waveform.flatten()

        # YAMNet TFLite model expects exactly 15600 samples
        REQUIRED_SAMPLES = 15600
        if len(waveform) > REQUIRED_SAMPLES:
            waveform = waveform[:REQUIRED_SAMPLES]
        elif len(waveform) < REQUIRED_SAMPLES:
            waveform = np.pad(waveform, (0, REQUIRED_SAMPLES - len(waveform)), 'constant')
        
        interpreter.set_tensor(waveform_input_index, waveform)
        interpreter.invoke()
        scores = interpreter.get_tensor(scores_output_index)
        
        # scores is usually shape (N, 521) where N is number of frames (usually 0.96s per frame, so for 1 sec chunk it's 1 or 2 frames)
        # We will take the mean score across all frames
        if scores.ndim > 1:
            mean_scores = np.mean(scores, axis=0)
        else:
            mean_scores = scores

        top_class_index = np.argmax(mean_scores)
        top_score = mean_scores[top_class_index]
        top_class_name = class_names[top_class_index]
        
        # We can also check all scores above threshold, but checking the top or any score is fine.
        # Let's check all classes that cross the threshold
        threat_detected = False
        for i, score in enumerate(mean_scores):
            if score > CONFIDENCE_THRESHOLD:
                c_name = class_names[i]
                threat_type = map_class_to_threat(c_name)
                if threat_type:
                    current_time = time.time()
                    if current_time - last_alert_time >= COOLDOWN_SECONDS:
                        trigger_alert(threat_type, c_name, score)
                        last_alert_time = current_time
                    else:
                        print(f"\033[93m[COOLDOWN] Suppressed {threat_type} alert for {c_name} (Confidence: {score:.2f}).\033[0m")
                    threat_detected = True
        
        if not threat_detected:
            # Print a subtle heartbeat log
            print(f"\033[92m[LISTENING] Top sound: {top_class_name} ({top_score:.2f})\033[0m", end='\r')

    def detect_phrases(waveform):
        nonlocal last_alert_time

        try:
            audio = waveform.flatten().astype(np.float32)

            result = whisper_model.transcribe(
                audio,
                fp16=False,
                language="en"
            )

            text = result["text"].lower().strip()

            if text:
                print(f"\n\033[96m[VOICE] {text}\033[0m")

            for phrase, threat_type in PHRASE_KEYWORDS.items():

                if phrase in text:

                    current_time = time.time()

                    if current_time - last_alert_time >= COOLDOWN_SECONDS:
                        trigger_alert(threat_type, phrase, 1.0)
                        last_alert_time = current_time

        except Exception as e:
            print("Whisper Error:", e)
    # 4. Start processing
    if args.source == "mic":
        print("\033[94m[INIT] Starting microphone stream...\033[0m")
        # Define callback
        q = queue.Queue()

        def audio_callback(indata, frames, time_info, status):
            if status:
                print(status, file=sys.stderr)
            q.put(indata.copy())

        chunk_samples = int(SAMPLE_RATE * CHUNK_DURATION)
        try:
            with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype='float32', 
                                blocksize=chunk_samples, callback=audio_callback):
                print("\033[92m[READY] Edge Audio AI is active and listening...\033[0m")
                while True:
                    chunk = q.get()
                    process_audio_chunk(chunk)
                    detect_phrases(chunk)

        except KeyboardInterrupt:
            print("\n\033[93m[EXIT] Stopping stream.\033[0m")
        except Exception as e:
            print(f"\n\033[91m[ERROR] Audio stream error: {e}\033[0m")
            
    else:
        # File mode
        if not os.path.exists(args.source):
            print(f"\033[91m[ERROR] File not found: {args.source}\033[0m")
            sys.exit(1)
        
        print(f"\033[94m[INIT] Processing file: {args.source}\033[0m")
        sr, data = wavfile.read(args.source)
        if sr != SAMPLE_RATE:
            # Very basic check, you might want to resample in a real product using scipy.signal.resample
            print(f"\033[93m[WARN] File sample rate is {sr}Hz, YAMNet expects {SAMPLE_RATE}Hz. Results may be inaccurate.\033[0m")
            # We'll let it process anyway for the hackathon
            
        chunk_samples = int(SAMPLE_RATE * CHUNK_DURATION)
        total_samples = len(data)
        
        for start in range(0, total_samples, chunk_samples):
            end = min(start + chunk_samples, total_samples)
            chunk = data[start:end]
            if len(chunk) < chunk_samples / 2:
                # skip very small chunks at the end
                break
            process_audio_chunk(chunk)
            time.sleep(CHUNK_DURATION) # simulate real-time processing
            
        print("\n\033[92m[DONE] Finished processing file.\033[0m")

    

if __name__ == "__main__":
    main()
