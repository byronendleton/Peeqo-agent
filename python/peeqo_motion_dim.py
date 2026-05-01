#!/usr/bin/env python3

import time
import subprocess
import urllib.request
from io import BytesIO
from PIL import Image, ImageChops, ImageStat


SNAPSHOT_URL = "http://127.0.0.1:8765/snapshot"

# Motion tuning
CHECK_INTERVAL = 1.0
MOTION_THRESHOLD = 8.0

# Screen timing
DIM_AFTER = 300
#OFF_AFTER = 0

# Screen brightness
BRIGHTNESS_AWAKE = "1.0"
BRIGHTNESS_DIM = "0.05"
NORMAL_BRIGHTNESS = 1.0
DIM_BRIGHTNESS = 0.05
FADE_SECONDS = 1
HA_MOTION_WEBHOOK = "http://homeassistant.local:8123/api/webhook/peeqo_motion_seen"
HA_MOTION_MIN_INTERVAL = 30
last_ha_motion_sent = 0


last_motion = time.time()
screen_state = "awake"
previous_frame = None

def set_brightness(value):
    value = max(0.05, min(1.0, value))
    run(f"DISPLAY=:0 xrandr --output HDMI-1 --brightness {value}")

def run(cmd):
    subprocess.run(
        cmd,
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )


def get_display_name():
    try:
        output = subprocess.check_output(
            "DISPLAY=:0 xrandr --query | grep ' connected' | awk '{print $1}' | head -n1",
            shell=True,
            text=True
        ).strip()

        if output:
            return output
    except Exception:
        pass

    return None


DISPLAY_NAME = get_display_name()

def disable_dpms():
    run("DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority xset s off")
    run("DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority xset -dpms")
    run("DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority xset s noblank")

def set_brightness(value):
    global DISPLAY_NAME

    if not DISPLAY_NAME:
        DISPLAY_NAME = get_display_name()

    if DISPLAY_NAME:
        run(f"DISPLAY=:0 xrandr --output {DISPLAY_NAME} --brightness {value}")


def wake_screen():
    global screen_state

    # Tell HA Peeqo has seen recent motion.
    # notify_ha_motion() has its own rate limit, so this is safe.
    notify_ha_motion()

    # Wake display (in case it's off)
    run("DISPLAY=:0 xset dpms force on")
    run("DISPLAY=:0 xset s reset")

    # Instantly restore brightness
    set_brightness(BRIGHTNESS_AWAKE)

    if screen_state != "awake":
        print("screen: awake", flush=True)

    screen_state = "awake"


def dim_screen():
    global screen_state

    if screen_state == "dim":
        return

    print("screen: dim fade", flush=True)

    steps = 20
    delay = FADE_SECONDS / steps

    for i in range(steps + 1):
        brightness = NORMAL_BRIGHTNESS - ((NORMAL_BRIGHTNESS - DIM_BRIGHTNESS) * (i / steps))
        set_brightness(brightness)
        time.sleep(delay)

    screen_state = "dim"


def off_screen():

    global screen_state

    dim_screen()

    if screen_state != "dim":

        print("screen: off disabled, staying dim", flush=True)

    screen_state = "dim"


def fetch_frame():
    try:
        with urllib.request.urlopen(SNAPSHOT_URL, timeout=2) as response:
            data = response.read()

        img = Image.open(BytesIO(data))
        img = img.convert("L")
        img = img.resize((160, 120))
        return img

    except Exception as e:
        print(f"snapshot:error {e}", flush=True)
        return None


def motion_score(frame_a, frame_b):
    diff = ImageChops.difference(frame_a, frame_b)
    stat = ImageStat.Stat(diff)
    return stat.mean[0]


def notify_ha_motion():
    global last_ha_motion_sent

    now = time.time()

    if now - last_ha_motion_sent < HA_MOTION_MIN_INTERVAL:
        return

    last_ha_motion_sent = now

    try:
        req = urllib.request.Request(
            HA_MOTION_WEBHOOK,
            data=b'{"motion": true, "source": "peeqo"}',
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        urllib.request.urlopen(req, timeout=2).read()
        print("ha motion: sent", flush=True)

    except Exception as e:
        print(f"ha motion: failed: {e}", flush=True)

print("peeqo motion dim started", flush=True)
print(f"snapshot: {SNAPSHOT_URL}", flush=True)
print(f"display: {DISPLAY_NAME}", flush=True)

wake_screen()

while True:
    frame = fetch_frame()
    now = time.time()

    global_last_dpms_fix = globals().get("last_dpms_fix", 0)
    if now - global_last_dpms_fix > 60:
        disable_dpms()
        globals()["last_dpms_fix"] = now

    if frame is not None:
        if previous_frame is not None:
            score = motion_score(previous_frame, frame)

            if score >= MOTION_THRESHOLD:
                last_motion = now
                print(f"motion score={score:.2f}", flush=True)
                wake_screen()

        previous_frame = frame

    idle_time = now - last_motion

    if idle_time >= DIM_AFTER:
        if screen_state == "awake":
            dim_screen()

    time.sleep(CHECK_INTERVAL)
