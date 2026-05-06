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

//full clean reboot
sudo systemctl stop peeqo.service
sudo pkill -f "electron ."
sudo pkill -f "camera_server.py"
sudo pkill -9 arecord
sudo fuser -k 8765/tcp
sudo fuser -k 8766/tcp
sleep 2
sudo systemctl start peeqo.service
sudo journalctl -u peeqo.service -n 80 --no-pager

//short reboot
sudo systemctl restart peeqo.service

//jserror
sudo ss -ltnp | grep -E ":8765|:8766"


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


//servo test

sudo systemctl stop peeqo.service

cd ~/peeqo-agent/electron
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js look-up
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js look-down
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js nod-yes 
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js shake-no
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js curious
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js excited
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js tiny-dance
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js slow-sway
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js jiggle
DISPLAY=:0 XAUTHORITY=/home/peeqo/.Xauthority npx electron test-servo.js alert

sudo systemctl start peeqo.service

//plane spotter
curl http://192.168.1.182:5055/random/planes

curl -X POST http://127.0.0.1:8766/plane \
  -H "Content-Type: application/json" \
  -d '{"callsign":"ANZ123","airline":"Air New Zealand","altitude":32000,"aircraft":"A320","distance":"4.2 km"}'

//gif server
  http://192.168.1.182:5055

mkdir -p ~/peeqo-gif-server/media/wake_up
mkdir -p ~/peeqo-gif-server/media/sleepy

nano ~/peeqo-gif-server/collect-gifs.js

add categories

cd ~/peeqo-gif-server
node collect-gifs.js

test
curl http://localhost:5055/random/wake_up
curl http://localhost:5055/random/sleepy

//test
curl http://192.168.1.182:5055/random/wake_up

fetch("http://192.168.1.182:5055/random/wake_up")

sliught fwd nod
~/test-snooze-pose.sh 1655 1324 1564

motor ticking only
~/test-snooze-pose.sh 1140 2468 1118

side nod
~/test-snooze-pose.sh 1587 1289 1655

back nod
~/test-snooze-pose.sh 1518 1758 1266

fwd nod
~/test-snooze-pose.sh 1873 1209 1461

motor ticking only
~/test-snooze-pose.sh 934 2331 1335

centre
~/test-snooze-pose.sh 1518 1518 1518