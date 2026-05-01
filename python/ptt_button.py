import RPi.GPIO as GPIO
import time
import subprocess
import os

# Needed for xdotool
os.environ["DISPLAY"] = ":0"
os.environ["XAUTHORITY"] = "/home/peeqo/.Xauthority"

PIN = 17
DEBOUNCE_SECONDS = 1.5

GPIO.setmode(GPIO.BCM)
GPIO.setup(PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

print("[PTT] ready")

last_press = 0
was_pressed = False

try:
    while True:
        pressed = GPIO.input(PIN) == GPIO.HIGH

        # Fire only once when button changes from not pressed -> pressed
        if pressed and not was_pressed:
            now = time.time()

            if now - last_press > DEBOUNCE_SECONDS:
                print("[PTT] pressed")
                subprocess.run(["xdotool", "key", "space"])
                last_press = now

        was_pressed = pressed
        time.sleep(0.03)

except KeyboardInterrupt:
    GPIO.cleanup()
