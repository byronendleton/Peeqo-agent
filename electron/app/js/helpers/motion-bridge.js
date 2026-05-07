"use strict";

const http = require("http");
const event = require("js/events/events");
const debug = require("js/helpers/debug");
const macGif = require("js/helpers/mac-gif");

const PORT = 8767;

let timers = [];
let sleepState = "awake";

function addTimer(fn, delay) {
    const timer = setTimeout(() => {
        timers = timers.filter((t) => t !== timer);
        fn();
    }, delay);

    timers.push(timer);
    return timer;
}

function clearTimers() {
    for (const timer of timers) {
        clearTimeout(timer);
    }
    timers = [];
}

function reply(res, text) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`${text}\n`);
}

class MotionBridge {
    constructor() {
        this.server = http.createServer((req, res) => {
            const url = req.url || "/";
            const force = url.includes("force=1");

            if (url.startsWith("/health")) {
                reply(res, `ok ${sleepState}`);
                return;
            }

            if (url.startsWith("/state")) {
                reply(res, `state=${sleepState} timers=${timers.length}`);
                return;
            }

            if (url.startsWith("/reset-servo")) {
                debug("[motion-bridge] reset-servo");

                clearTimers();
                sleepState = "awake";
                event.emit("peeqo-awake-eyes");
                event.emit("servo-reset");

                reply(res, "reset-servo");
                return;
            }

            if (url.startsWith("/sleep-eyes")) {
                debug("[motion-bridge] sleep-eyes test");
                event.emit("peeqo-sleep-eyes");
                reply(res, "sleep-eyes");
                return;
            }

            if (url.startsWith("/awake-eyes")) {
                debug("[motion-bridge] awake-eyes test");
                event.emit("peeqo-awake-eyes");
                reply(res, "awake-eyes");
                return;
            }

            if (url.startsWith("/snooze")) {
                debug(`[motion-bridge] snooze requested, state=${sleepState}`);

                if ((sleepState === "entering-sleep" || sleepState === "sleeping" || sleepState === "waking") && !force) {
                    reply(res, `already-${sleepState}`);
                    return;
                }

                clearTimers();
                sleepState = "entering-sleep";
                reply(res, "snooze");

                macGif.showMacGif("sleepy", "sleepy reaction", 5000);

                addTimer(() => {
                    if (sleepState !== "entering-sleep") {
                        debug(`[motion-bridge] snooze skipped, state=${sleepState}`);
                        return;
                    }

                    event.emit("show-div", "eyeWrapper");
                    event.emit("peeqo-sleep-eyes");
                    event.emit("servo-move", "snooze");

                    sleepState = "sleeping";
                    debug("[motion-bridge] state=sleeping");
                }, 5600);

                return;
            }

            if (url.startsWith("/wake-up")) {
                debug(`[motion-bridge] wake-up requested, state=${sleepState}`);

                if (sleepState === "waking" && !force) {
                    reply(res, "already-waking");
                    return;
                }

                if (sleepState === "awake" && !force) {
                    event.emit("peeqo-awake-eyes");
                    reply(res, "already-awake");
                    return;
                }

                clearTimers();
                sleepState = "waking";
                reply(res, "wake-up");

                event.emit("show-div", "eyeWrapper");
                event.emit("peeqo-awake-eyes");
                event.emit("servo-move", "wake-startled");

                event.emit("led-on", {
                    anim: "fadeOutError",
                    color: "red",
                });

                addTimer(() => {
                    macGif.showMacGif("wake_grumpy", "grumpy wake up reaction", 5000);
                }, 700);

                // Do not servo-reset here. wake-startled.json should finish at neutral.
                addTimer(() => {
                    sleepState = "awake";
                    debug("[motion-bridge] state=awake");
                }, 5000);

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
