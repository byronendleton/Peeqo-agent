"use strict";

const fs = require("fs");
const path = require("path");
const event = require("js/events/events");
const debug = require("js/helpers/debug");

const CAMERA_SOUND = path.join(process.cwd(), "app", "media", "sounds", "camera-quirky.wav");

const PORT = 8765;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const PHOTO_DIR = path.join(process.env.HOME || "/home/peeqo", "Pictures", "peeqo");

class Camera {
    constructor() {
        this.streaming = false;
        this.countdownEl = null;

        event.on("camera-on", () => this.startCamera());
        event.on("camera-off", () => this.stopCamera());
        event.on("camera-photo", () => this.takePhoto());

        debug("[camera] using background camera service");
    }

    startCamera() {
        const feed = document.getElementById("cameraFeed");

        if (feed) {
            feed.src = `${BASE_URL}/stream?t=${Date.now()}`;
        }

        this.streaming = true;
        event.emit("show-div", "cameraWrapper");

        debug("[camera] stream shown");
    }

    stopCamera() {
        const feed = document.getElementById("cameraFeed");

        if (feed) {
            feed.src = "";
        }

        this.streaming = false;
        event.emit("show-div", "eyeWrapper");

        this.hideCountdownText();
        this.cameraLedOff();

        debug("[camera] stream hidden");
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    playCameraSound() {
        try {
            const audio = new Audio(`file://${CAMERA_SOUND}`);
            audio.volume = 1.0;
            audio.play().catch((err) => {
                console.warn("[camera] sound play failed:", err);
            });
        } catch (err) {
            console.warn("[camera] sound error:", err);
        }
    }

    cameraLedCountdownFlash() {
        event.emit("led-on", {
            anim: "blink",
            color: "purple",
        });
    }

    cameraLedSnapFlash() {
        event.emit("led-on", {
            anim: "blink",
            color: "yellow",
        });
    }

    cameraLedErrorFlash() {
        event.emit("led-on", {
            anim: "fadeOutError",
            color: "red",
        });
    }

    cameraLedOff() {
        event.emit("led-off");
    }

    ensureCountdownOverlay() {
        if (this.countdownEl) {
            return this.countdownEl;
        }

        const el = document.createElement("div");

        el.id = "camera-countdown-overlay";
        el.style.position = "fixed";
        el.style.left = "0";
        el.style.top = "0";
        el.style.width = "100vw";
        el.style.height = "100vh";
        el.style.display = "none";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.zIndex = "99999";
        el.style.pointerEvents = "none";
        el.style.fontFamily = "Arial, sans-serif";
        el.style.fontSize = "180px";
        el.style.fontWeight = "bold";
        el.style.color = "white";
        el.style.textShadow = "0 0 20px black, 0 0 40px black";
        el.style.background = "rgba(0, 0, 0, 0.12)";

        document.body.appendChild(el);

        this.countdownEl = el;
        return this.countdownEl;
    }

    showCountdownText(text) {
        const el = this.ensureCountdownOverlay();

        el.textContent = text;
        el.style.display = "flex";
    }

    hideCountdownText() {
        if (!this.countdownEl) {
            return;
        }

        this.countdownEl.style.display = "none";
        this.countdownEl.textContent = "";
    }

    async photoCountdown() {
        debug("[camera] photo countdown started");

        for (let i = 3; i > 0; i--) {
            console.log("[camera] photo in", i);

            this.showCountdownText(String(i));

            // 3 / 2 / 1 = purple blink
            this.cameraLedCountdownFlash();

            await this.sleep(1000);
        }

        console.log("[camera] snap");

        this.showCountdownText("SMILE");
        this.playCameraSound();

        // Photo moment = yellow blink
        this.cameraLedSnapFlash();

        await this.sleep(350);

        this.hideCountdownText();
        this.cameraLedOff();
    }

    async takePhoto() {
        const wasStreaming = this.streaming;

        try {
            if (!this.streaming) {
                this.startCamera();
                await this.sleep(500);
            }

            await this.photoCountdown();

            fs.mkdirSync(PHOTO_DIR, { recursive: true });

            const res = await fetch(`${BASE_URL}/snapshot?t=${Date.now()}`);

            if (!res.ok) {
                throw new Error(`Snapshot failed: HTTP ${res.status}`);
            }

            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (!buffer || buffer.length < 1000) {
                throw new Error(`Snapshot too small: ${buffer.length} bytes`);
            }

            const timestamp = new Date()
                .toISOString()
                .replace(/:/g, "-")
                .replace(/\..+/, "");

            const datedPath = path.join(PHOTO_DIR, `peeqo-${timestamp}.jpg`);
            const latestPath = path.join(PHOTO_DIR, "latest.jpg");

            fs.writeFileSync(datedPath, buffer);
            fs.writeFileSync(latestPath, buffer);

            debug(`[camera] snapshot saved: ${latestPath}`);

            fetch("http://192.168.1.66:8123/api/webhook/peeqo_voice_snapshot", {
                method: "POST",
            }).then(() => {
                debug("[camera] HA snapshot webhook sent");
            }).catch((err) => {
                console.warn("[camera] HA snapshot webhook failed:", err);
            });

            const picture = document.getElementById("pictureCapture");

            if (picture) {
                picture.src = `file://${latestPath}?t=${Date.now()}`;
                event.emit("show-div", "pictureWrapper");

                setTimeout(() => {
                    if (wasStreaming) {
                        event.emit("show-div", "cameraWrapper");
                    } else {
                        this.stopCamera();
                        event.emit("show-div", "eyeWrapper");
                    }
                }, 4000);
            } else {
                if (!wasStreaming) {
                    this.stopCamera();
                    event.emit("show-div", "eyeWrapper");
                }
            }

            this.cameraLedOff();

            return {
                datedPath,
                latestPath,
                bytes: buffer.length,
            };

        } catch (err) {
            console.warn("[camera] snapshot failed:", err);

            this.hideCountdownText();

            // Error = red fadeOutError
            this.cameraLedErrorFlash();

            setTimeout(() => {
                this.cameraLedOff();
            }, 2000);

            if (wasStreaming) {
                event.emit("show-div", "cameraWrapper");
            } else {
                this.stopCamera();
                event.emit("show-div", "eyeWrapper");
            }

            return null;
        }
    }
}

module.exports = Camera;