"use strict";

// Servo driver (PCA9685 via I2C) runs in the main process because pca9685
// is NAN-based and cannot be loaded in the Electron renderer on Electron 14+.
// The renderer sends 'servo-move' / 'servo-reset' IPC messages; this module
// handles I2C writes and animation playback.

const { ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const debug = require("./app/js/helpers/debug");

const PLAYBACK_RATE_MS = 45; 
const SNOOZE_PLAYBACK_RATE_MS = 120;
//const PLAYBACK_RATE_MS = 33;
const REST_PULSE_US = 1500;

// Existing animations use roughly this range.
// look-up.json has values down to 866, so do not clamp at 1000.
const MIN_PULSE_US = 850;
const MAX_PULSE_US = 2200;

const ANIM_DIR = path.join(__dirname, "app", "media", "servo_anims");

let pwm = null;
let servoTimer = null;
let currentAnim = null;;

function setup() {
    let i2cBus, PCA9685;

    try {
        i2cBus = require("i2c-bus");
        PCA9685 = require("pca9685").Pca9685Driver;
    } catch (err) {
        console.error("[servo-main] failed to load pca9685 / i2c-bus:", err.message);
        return;
    }

    try {
        const options = {
            i2c: i2cBus.openSync(1),
            address: 0x40,
            frequency: 50,
            debug: false,
        };

        pwm = new PCA9685(options, (err) => {
            if (err) {
                console.error("[servo-main] PCA9685 init error:", err);
                pwm = null;
                return;
            }

            reset();
            debug("[servo-main] PCA9685 ready");
        });
    } catch (err) {
        console.error("[servo-main] failed to open I2C bus:", err.message);
        return;
    }

    ipcMain.on("servo-move", (_, animName) => animate(animName));
    ipcMain.on("servo-reset", () => reset());
}

function reset() {
    if (servoTimer !== null) {
        clearTimeout(servoTimer);
        servoTimer = null;
    }

    currentAnim = null;

    if (!pwm) return;

    for (let i = 0; i < 3; i++) {
        pwm.setPulseLength(i, REST_PULSE_US);
    }
}

function clampPulse(pulse) {
    return Math.max(MIN_PULSE_US, Math.min(MAX_PULSE_US, pulse));
}

function animate(animName) {
    if (!pwm) {
        console.warn("[servo-main] no PCA9685 — skipping animation");
        return;
    }

    if (!animName || typeof animName !== "string") {
        console.error("[servo-main] invalid animation name:", animName);
        return;
    }

    debug(`[servo-main] loading animation: ${animName}`);

    const filepath = path.join(ANIM_DIR, `${animName}.json`);

    fs.readFile(filepath, "utf8", (err, contents) => {
        if (err) {
            console.error("[servo-main] error reading anim file:", err.message);
            return;
        }

        let data;

        try {
            data = JSON.parse(contents);
        } catch (e) {
            console.error("[servo-main] JSON parse error:", e.message);
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            console.error(`[servo-main] animation is empty or invalid: ${animName}`);
            return;
        }

        // Cancel any in-progress animation before starting the new one.
        reset();

        let index = 0;
const playbackRate = animName === "snooze" ? SNOOZE_PLAYBACK_RATE_MS : PLAYBACK_RATE_MS;

currentAnim = animName;

function playNextFrame() {
    if (currentAnim !== animName) {
        debug(`[servo-main] ${animName} stopped because currentAnim=${currentAnim}`);
        return;
    }

    const frame = data[index];

    if (index % 10 === 0) {
    debug(`[servo-main] ${animName} frame ${index}/${data.length}: ${frame.join(",")}`);
}

    if (!Array.isArray(frame) || frame.length < 3) {
        console.error(`[servo-main] bad frame ${index} in ${animName}`);
        servoTimer = null;
        currentAnim = null;
        reset();
        return;
    }

    for (let i = 0; i < 3; i++) {
        const pulse = Number(frame[i]);

        if (!Number.isFinite(pulse)) {
            console.error(`[servo-main] invalid pulse on servo ${i}, frame ${index}, in ${animName}`);
            servoTimer = null;
            currentAnim = null;
            reset();
            return;
        }

        pwm.setPulseLength(i, clampPulse(pulse));
    }

    index++;

    if (index >= data.length) {
        debug(`[servo-main] finished animation: ${animName}`);
        servoTimer = null;
        currentAnim = null;
        return;
    }

    servoTimer = setTimeout(playNextFrame, playbackRate);
}

debug(`[servo-main] starting animation: ${animName}, frames=${data.length}, rate=${playbackRate}ms`);
playNextFrame();
        });

}
module.exports = { setup };
