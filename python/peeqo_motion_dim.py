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

# Sleep / dim timing
SNOOZE_AFTER = 240      # 4 min
DIM_AFTER = 300         # 5 min
ENTERING_SLEEP_GRACE = 30

# For testing:
# SNOOZE_AFTER = 30
# DIM_AFTER = 45
# ENTERING_SLEEP_GRACE = 60

# Brightness
BRIGHTNESS_AWAKE = 1.0
BRIGHTNESS_DIM = 0.05
FADE_SECONDS = 1

# Home Assistant motion webhook
HA_MOTION_WEBHOOK = "http://homeassistant.local:8123/api/webhook/peeqo_motion_seen"
HA_MOTION_MIN_INTERVAL = 30

last_motion = time.time()
last_ha_motion_sent = 0
last_dpms_fix = 0

screen_state = "awake"
previous_frame = None

snoozing = False
dimmed = False
entering_sleep_until = 0


def run(cmd):
    subprocess.run(
        cmd,
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def get_display_name():
    try:
        output = subprocess.check_output(
            "DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority "
            "xrandr --query | grep ' connected' | awk '{print $1}' | head -n1",
            shell=True,
            text=True,
        ).strip()

        if output:
            return output
    except Exception:
        pass

    return "HDMI-1"


DISPLAY_NAME = get_display_name()


def disable_dpms():
    run("DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority xset s off")
    run("DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority xset -dpms")
    run("DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority xset s noblank")


def set_brightness(value):
    value = max(0.05, min(1.0, float(value)))
    run(
        f"DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority "
        f"xrandr --output {DISPLAY_NAME} --brightness {value}"
    )


def call_peeqo(path):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:8767{path}", timeout=5).read()
        print(f"peeqo-call:sent {path}", flush=True)
    except Exception as e:
        print(f"peeqo-call:error {path} {e}", flush=True)


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


def wake_screen():
    global screen_state, snoozing, dimmed, entering_sleep_until

    run("DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority xset s reset")
    run("DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority xset dpms force on")
    set_brightness(BRIGHTNESS_AWAKE)

    if snoozing or dimmed or screen_state != "awake":
        print("motion wake: startled", flush=True)
        call_peeqo("/wake-up")

    snoozing = False
    dimmed = False
    entering_sleep_until = 0

    if screen_state != "awake":
        print("screen: awake", flush=True)

    screen_state = "awake"
    notify_ha_motion()


def dim_screen():
    global screen_state, dimmed

    if screen_state == "dim":
        return

    print("screen: dim fade", flush=True)

    steps = 20
    delay = FADE_SECONDS / steps

    for i in range(steps + 1):
        brightness = BRIGHTNESS_AWAKE - ((BRIGHTNESS_AWAKE - BRIGHTNESS_DIM) * (i / steps))
        set_brightness(brightness)
        time.sleep(delay)

    dimmed = True
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


print("peeqo motion dim started", flush=True)
print(f"snapshot: {SNAPSHOT_URL}", flush=True)
print(f"display: {DISPLAY_NAME}", flush=True)

disable_dpms()
wake_screen()

while True:
    now = time.time()

    if now - last_dpms_fix > 60:
        disable_dpms()
        last_dpms_fix = now

    frame = fetch_frame()

    if frame is not None:
        if previous_frame is not None:
            score = motion_score(previous_frame, frame)

            if score >= MOTION_THRESHOLD:
                print(f"motion score={score:.2f}", flush=True)

                if snoozing and now < entering_sleep_until:
                    print("motion ignored: entering sleep", flush=True)
                else:
                    last_motion = now
                    wake_screen()

        previous_frame = frame

    idle_time = now - last_motion

    if idle_time >= SNOOZE_AFTER and not snoozing:
        snoozing = True
        entering_sleep_until = now + ENTERING_SLEEP_GRACE
        print("screen: snooze", flush=True)
        call_peeqo("/snooze")

    if idle_time >= DIM_AFTER and screen_state == "awake":
        dim_screen()

    time.sleep(CHECK_INTERVAL)
