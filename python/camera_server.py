#!/usr/bin/env python3
"""
MJPEG HTTP camera server for Peeqo.

Serves:
  GET /stream    MJPEG live stream
  GET /snapshot  latest JPEG frame

Designed to run as a background systemd user service.
"""

import http.server
import subprocess
import threading
import time
import sys
import signal

PORT = 8765
HOST = "0.0.0.0"

WIDTH = 640
HEIGHT = 480
FPS = 15

_lock = threading.Lock()
_latest_frame = None
_ffmpeg_proc = None
_running = True


def log(message):
    print(f"[camera_server] {message}", file=sys.stderr, flush=True)


def read_frames(proc):
    global _latest_frame

    buf = b""

    while _running:
        try:
            chunk = proc.stdout.read(65536)
        except Exception as e:
            log(f"read error: {e}")
            break

        if not chunk:
            log("camera process stopped producing data")
            break

        buf += chunk

        while True:
            start = buf.find(b"\xff\xd8")
            if start == -1:
                buf = b""
                break

            end = buf.find(b"\xff\xd9", start + 2)
            if end == -1:
                buf = buf[start:]
                break

            frame = buf[start:end + 2]

            with _lock:
                _latest_frame = frame

            buf = buf[end + 2:]


def start_capture():
    global _ffmpeg_proc, _latest_frame

    if _ffmpeg_proc and _ffmpeg_proc.poll() is None:
        return

    _latest_frame = None

    cmd = [
        "libcamera-vid",
        "-t", "0",
        "--codec", "mjpeg",
        "--width", str(WIDTH),
        "--height", str(HEIGHT),
        "--framerate", str(FPS),
        "--inline",
        "-o", "-"
    ]

    log("starting camera capture")
    log("command: " + " ".join(cmd))

    _ffmpeg_proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )

    threading.Thread(target=read_frames, args=(_ffmpeg_proc,), daemon=True).start()
    threading.Thread(target=read_stderr, args=(_ffmpeg_proc,), daemon=True).start()


def read_stderr(proc):
    while _running:
        line = proc.stderr.readline()
        if not line:
            break
        try:
            log("camera: " + line.decode(errors="replace").strip())
        except Exception:
            pass


def stop_capture():
    global _ffmpeg_proc

    if _ffmpeg_proc:
        log("stopping camera capture")
        try:
            _ffmpeg_proc.terminate()
            _ffmpeg_proc.wait(timeout=5)
        except Exception:
            try:
                _ffmpeg_proc.kill()
            except Exception:
                pass

    _ffmpeg_proc = None


class MJPEGHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def do_HEAD(self):
        if self.path.startswith("/snapshot"):
            with _lock:
                frame = _latest_frame

            if frame:
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(frame)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
            else:
                self.send_response(503)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()

        elif self.path.startswith("/stream"):
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path.startswith("/stream"):
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            try:
                while _running:
                    with _lock:
                        frame = _latest_frame

                    if frame:
                        self.wfile.write(
                            b"--frame\r\n"
                            b"Content-Type: image/jpeg\r\n"
                            b"Content-Length: " + str(len(frame)).encode() + b"\r\n"
                            b"\r\n" + frame + b"\r\n"
                        )
                        self.wfile.flush()

                    time.sleep(1 / FPS)

            except (BrokenPipeError, ConnectionResetError):
                pass

        elif self.path.startswith("/snapshot"):
            with _lock:
                frame = _latest_frame

            if frame:
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(frame)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(frame)
            else:
                self.send_error(503, "No frame available yet")

        elif self.path.startswith("/health"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok\n")

        else:
            self.send_error(404)


def handle_exit(signum, frame):
    global _running
    _running = False
    stop_capture()
    sys.exit(0)


signal.signal(signal.SIGTERM, handle_exit)
signal.signal(signal.SIGINT, handle_exit)

log(f"HTTP server starting on {HOST}:{PORT}")
start_capture()

server = http.server.ThreadingHTTPServer((HOST, PORT), MJPEGHandler)
log("ready")

try:
    server.serve_forever()
finally:
    stop_capture()