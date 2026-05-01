//notes

restartpeeqo

//While developing:
cd ~/peeqo-agent/electron
npx nodemon

//While developing:
npm start

//If things get weird:
pkill -9 arecord
pkill -9 electron
pkill -9 node

//Save a backup (Git commit)
cd ~/peeqo-agent

git add .
git commit -m "working version"
git push


//Check what changed
cd ~/peeqo-agent
git status
//ee exact edits:
git diff
//Make a safe checkpoint
git add .
git commit -m "working STT checkpoint"
//Upload to GitHub:
git push
//Undo one broken file
//Example:
git restore electron/app/js/intent-engines/stt.js
//Undo all uncommitted changes
//Careful — this deletes unsaved edits since last commit:
git restore .
//Go back to a previous checkpoint
//how commits:
git log --oneline
//Then restore to one:
git reset --hard COMMIT_ID
//Example:
git reset --hard a1b2c3d
//Best habit
//Before any risky change:
git add .
git commit -m "before STT changes"
//After it works:
git add .
git commit -m "STT stable"
git push

//restart comand
pkill -f "electron ."
sleep 1
cd ~/peeqo-agent/electron
DISPLAY=:0 npm start

//kill services
systemctl --user stop peeqo-motion-dim.service
systemctl --user stop peeqo-camera.service
systemctl --user stop peeqo.service
pkill -f camera_server.py || truesudo reboot
pkill -f libcamera-vid || true
pkill -f "electron ." || true
pkill -f "npm start" || true
pkill -f arecord || true

~/peeqo-stop-heavy.sh
~/peeqo-start-all.sh

//check whats running
ps aux | grep -E "peeqo|camera_server|libcamera|electron|arecord" | grep -v grep

//start everything
systemctl --user start peeqo-camera.service
systemctl --user start peeqo-motion-dim.service
systemctl --user start peeqo.service
sudo systemctl start peeqo.service

//live motion logs
journalctl --user -u peeqo-motion-dim.service -f

//to add
dance command
matching servo animations
Home Assistant → animation feedback loop

//leds 
1 = blink red
2 = blink aqua
3 = circle aqua
4 = circleOut purple
5 = fadeOutError orange
0 = off


//syntax check
cd ~/peeqo-agent/electron

node --check main.js && echo "main.js OK"
node --check app/js/global.js && echo "global.js OK"
node --check app/js/events/listeners.js && echo "listeners.js OK"

curl -X POST http://127.0.0.1:8766/plane \
  -H "Content-Type: application/json" \
  -d '{"callsign":"ANZ548","airline":"Air New Zealand","altitude":1200,"icao24":"c81abc"}'