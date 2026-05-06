"use strict";

const event = require("js/events/events");
const debug = require("js/helpers/debug");

const MAC_GIF_BASE = "http://192.168.1.182:5055";

function showMacGif(category, fallbackQuery, minDuration = 4000) {
    const url = `${MAC_GIF_BASE}/random/${encodeURIComponent(category)}`;

    debug(`[MAC GIF] request: ${url}`);

    fetch(url)
        .then((res) => {
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            return res.json();
        })
        .then((gif) => {
            if (!gif || !gif.url) {
                throw new Error("No gif.url returned");
            }

            debug(`[MAC GIF] ${category}: ${gif.url}`);

            const gifEl = document.getElementById("gif");

            if (!gifEl) {
                throw new Error("#gif element not found");
            }

            gifEl.src = `${gif.url}?t=${Date.now()}`;

            event.emit("show-div", "gifWrapper");

            setTimeout(() => {
                event.emit("show-div", "eyeWrapper");
            }, minDuration);
        })
        .catch((err) => {
            console.log(`[MAC GIF] ${category} error:`, err);

            // Fallback still uses existing remote GIF system.
            // This may move servos if the normal answer pipeline has default movement.
            event.emit("set-answer", {
                type: "remote",
                queryTerms: fallbackQuery || `${category} reaction`,
                loop: true,
                minDuration: minDuration,
            });
        });
}

module.exports = {
    showMacGif,
};