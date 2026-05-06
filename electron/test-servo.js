"use strict";

const { app } = require("electron");
const servoMain = require("./servo-main");

const anim = process.argv[2];

if (!anim) {
  console.error("Usage: npm run electron -- test-servo.js <animation-name>");
  process.exit(1);
}

app.whenReady().then(() => {
  servoMain.setup();

  setTimeout(() => {
    const { ipcMain } = require("electron");

    console.log(`[test] playing servo animation: ${anim}`);

    // Call the same internal listener path indirectly by requiring servo-main setup,
    // but easier: emit the IPC event straight at ipcMain.
    ipcMain.emit("servo-move", {}, anim);

    setTimeout(() => {
      console.log("[test] done");
      app.quit();
    }, 4000);
  }, 1000);
});
