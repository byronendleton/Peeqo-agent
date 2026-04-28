"use strict";

const recorder = require("node-record-lpcm16");
const os = require("os");
const debug = require("js/helpers/debug");
const { execSync } = require("child_process");

class Mic {
    constructor() {
        this.recorder = os.arch() == "arm" ? "arecord" : "rec";

        this.recorderOpts = {
            verbose: true,
            threshold: 0,
            recorder: this.recorder,
            sampleRate: 16000,
            channels: 1,
            audioType: "raw",
        };

        if (this.recorder === "arecord") {
            this.recorderOpts.device = "plughw:2,0";
        }

        this.recordingProcess = null;
        this.paused = false;

        // Do NOT start mic immediately. Start it only when needed.
        debug("Microphone initialized");
    }

    wakeMic() {
        if (this.recorder !== "arecord") return;

        try {
	execSync("arecord -D plughw:2,0 -f S16_LE -r 16000 -c 1 -d 1 -t raw > /dev/null", {
                stdio: "ignore",
                timeout: 2000
            });
        } catch (e) {
            debug("Mic wake failed, continuing anyway");
        }
    }

    stopMic() {
        if (this.recordingProcess) {
            try {
                this.recordingProcess.stop();
            } catch (e) {
                console.error("Mic stop error:", e.message);
            }
            this.recordingProcess = null;
            debug("Microphone stopped");
        }
    }

    startMic() {
        this.stopMic();

        this.wakeMic();

        this.recordingProcess = recorder.record(this.recorderOpts);

        const stream = this.recordingProcess.stream();

        stream.on("error", (err) => {
            console.error("Microphone recording error:", err);
            this.stopMic();
        });

        debug("Microphone recording started");
        return stream;
    }

    getMic() {
        if (this.paused) return null;

        if (!this.recordingProcess) {
            return this.startMic();
        }

        return this.recordingProcess.stream();
    }

    pause() {
        this.stopMic();
        this.paused = true;
        debug("Microphone paused/stopped");
    }

    resume() {
        this.paused = false;
        debug("Microphone resumed");
    }
}

const mic = new Mic();

module.exports = mic;
