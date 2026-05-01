import math
import wave
import struct
import os

SAMPLE_RATE = 16000
DURATION = 3 # seconds
FREQ = 440.0 # Hz

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sample_data')
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, 'test.wav')

with wave.open(out_path, 'w') as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2) # 2 bytes = 16-bit
    wav_file.setframerate(SAMPLE_RATE)
    
    for i in range(int(SAMPLE_RATE * DURATION)):
        value = int(32767.0 * 0.5 * math.sin(2.0 * math.pi * FREQ * (i / float(SAMPLE_RATE))))
        data = struct.pack('<h', value)
        wav_file.writeframesraw(data)

print(f"Generated test audio file at: {out_path}")
