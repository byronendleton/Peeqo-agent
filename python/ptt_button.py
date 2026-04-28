import RPi.GPIO as GPIO
import time
import subprocess
import os

# Needed for xdotool
os.environ["DISPLAY"] = ":0"
os.environ["XAUTHORITY"] = "/home/peeqo/.Xauthority"

PIN = 17

GPIO.setmode(GPIO.BCM)
GPIO.setup(PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

print("[PTT] ready")

last_press = 0

try:
    while True:
        if GPIO.input(PIN):
            now = time.time()
            if now - last_press > 1:
                print("[PTT] pressed")
                subprocess.run(["xdotool", "key", "space"])
                last_press = now
        time.sleep(0.05)

except KeyboardInterrupt:
    GPIO.cleanup()
