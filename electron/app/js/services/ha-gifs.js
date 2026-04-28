"use strict";

const mqtt = require("mqtt");

function setup(mainWindow) {
  const client = mqtt.connect("mqtt://HOME_ASSISTANT_IP:1883", {
    username: "YOUR_MQTT_USER",
    password: "YOUR_MQTT_PASSWORD",
  });

  client.on("connect", () => {
    console.log("[HA GIFS] Connected");
    client.subscribe("peeqo/gif");
  });

  client.on("message", (topic, message) => {
    const command = message.toString();

    console.log("[HA GIFS] Received:", command);

    // Send to UI (this is key)
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("ha-gif", command);
    }
  });
}

module.exports = { setup };
