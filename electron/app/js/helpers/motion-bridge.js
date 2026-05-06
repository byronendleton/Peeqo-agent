"use strict";

const http = require("http");
const event = require("js/events/events");
const debug = require("js/helpers/debug");
const macGif = require("js/helpers/mac-gif");

const PORT = 8767;

let sleepTimers = [];

function addSleepTimer(fn, delay) {
    const timer = setTimeout(() => {
        sleepTimers = sleepTimers.filter((t) => t !== timer);
        fn();
    }, delay);

    sleepTimers.push(timer);
    return timer;
}

function clearSleepTimers() {
    for (const timer of sleepTimers) {
        clearTimeout(timer);
    }

    sleepTimers = [];
}

class MotionBridge {
    constructor() {
        this.server = http.createServer((req, res) => {
            const url = req.url || "/";

            if (url.startsWith("/health")) {
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("ok\n");
                return;
            }

            if (url.startsWith("/reset-servo")) {
                debug("[motion-bridge] reset-servo");

                clearSleepTimers();
                event.emit("servo-reset");

                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("reset-servo\n");
                return;
            }

            if (url.startsWith("/sleep-eyes")) {
                debug("[motion-bridge] sleep-eyes test");

                event.emit("peeqo-sleep-eyes");

                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("sleep-eyes\n");
                return;
            }

            if (url.startsWith("/awake-eyes")) {
                debug("[motion-bridge] awake-eyes test");

                event.emit("peeqo-awake-eyes");

                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("awake-eyes\n");
                return;
            }

            if (url.startsWith("/snooze")) {
                debug("[motion-bridge] snooze sequence");

                clearSleepTimers();

                event.emit("servo-reset");

                macGif.showMacGif("sleepy", "sleepy reaction", 5000);

                addSleepTimer(() => {
                    event.emit("show-div", "eyeWrapper");
                }, 5200);

                addSleepTimer(() => {
                    event.emit("peeqo-sleep-eyes");
                }, 5600);

                addSleepTimer(() => {
                    event.emit("servo-move", "snooze");
                }, 5900);

                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("snooze\n");
                return;
            }

            if (url.startsWith("/wake-up")) {
                debug("[motion-bridge] wake-up");

                clearSleepTimers();

                event.emit("show-div", "eyeWrapper");
                event.emit("peeqo-awake-eyes");

                event.emit("servo-move", "wake-startled");

                event.emit("led-on", {
                    anim: "fadeOutError",
                    color: "red",
                });

                setTimeout(() => {
                    event.emit("servo-reset");
                }, 2500);

                setTimeout(() => {
                    macGif.showMacGif("wake_grumpy", "grumpy wake up reaction", 5000);
                }, 700);

                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("wake-up\n");
                return;
            }

            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("not found\n");
        });

        this.server.listen(PORT, "127.0.0.1", () => {
            debug(`[motion-bridge] listening on 127.0.0.1:${PORT}`);
        });

        this.server.on("error", (err) => {
            console.warn("[motion-bridge] server error:", err);
        });
    }
}

module.exports = MotionBridge;
