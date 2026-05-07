const event = require('js/events/events')
const action = require('js/actions/actions')
const debug = require('js/helpers/debug')
const common = require('js/helpers/common')
const power = require('js/power/power')
const speak = require('js/senses/speak')
const stt = require('js/intent-engines/stt')
const claude = require('js/intent-engines/claude')
const textBubble = require('js/senses/text')
const mic = require('js/senses/mic')
const actions = require('js/actions/actions')
const process = require('process')

let danceTimer = null

function startDance() {
    if (danceTimer) return

    console.log('[SERVO] dance started')

    const moves = ['jiggle', 'look-up', 'alert', 'look-up-slow']

    function loop() {
        const move = moves[Math.floor(Math.random() * moves.length)]
        event.emit('servo-move', move)

        const next = 1200 + Math.random() * 1200
        danceTimer = setTimeout(loop, next)
    }

    loop()
}

function stopDance(resetServo = true) {
    if (!danceTimer) return

    clearTimeout(danceTimer)
    danceTimer = null

    if (resetServo) {
        event.emit('servo-reset')
    }

    console.log('[SERVO] dance stopped')
}

function pickGifQuery(actionName, queries) {
    if (!Array.isArray(queries) || queries.length === 0) return 'light switch funny'

    if (!global.recentGifQueries) global.recentGifQueries = {}
    if (!global.recentGifQueries[actionName]) global.recentGifQueries[actionName] = []

    const recent = global.recentGifQueries[actionName]
    const freshChoices = queries.filter(q => !recent.includes(q))
    const pool = freshChoices.length ? freshChoices : queries
    const picked = pool[Math.floor(Math.random() * pool.length)]

    recent.push(picked)

    while (recent.length > Math.min(6, queries.length - 1)) {
        recent.shift()
    }

    console.log(`[HA GIF] picked query for ${actionName}: ${picked}`)

    return picked
}

function handleLightsCommand(transcript) {
    if (
        !transcript.includes('light') &&
        !transcript.includes('lights') &&
        !transcript.includes('switch')
    ) {
        return false
    }

    const rooms = ['lounge', 'kitchen', 'bedroom', 'study']
    const room = rooms.find(r => transcript.includes(r))

    if (!room) return false

    let lightAction = 'toggle'

    if (transcript.includes('off') || transcript.includes('turn off')) lightAction = 'off'
    if (transcript.includes('on') || transcript.includes('turn on')) lightAction = 'on'

    const gifQueries = {
        on: [
            `${room} lights turning on`,
            `${room} lights on`,
            'let there be light',
            'lights turning on dramatic',
            'light bulb glowing',
            'bright room lights on',
            'stage lights turning on',
            'neon lights turning on',
            'room lights on',
            'electricity funny',
            'glowing light bulb',
            'sunrise dramatic',
            'brightness intensifies',
            'disco lights',
            'robot turns on lights',
            'lightsaber ignite'
        ],
        off: [
            `${room} lights turning off`,
            `${room} lights off`,
            'lights going out',
            'dark room lights off',
            'lights out funny',
            'turn off the lights',
            'power outage funny',
            'dramatic darkness',
            'fade to black',
            'goodnight lights off',
            'blackout funny',
            'night mode',
            'sleepy lights off',
            'the darkness',
            'movie theater lights off'
        ],
        toggle: [
            `${room} light switch`,
            `${room} lights toggle`,
            'light switch flip',
            'light switch funny',
            'robot button press',
            'dramatic light switch',
            'smart home lights',
            'electricity funny',
            'mood lighting',
            'disco lights',
            'lights on lights off',
            'button press funny',
            'switch flick',
            'toggle switch',
            'home automation lights'
        ]
    }

    global.commandHandled = true

    console.log(`[HA] ${lightAction} ${room} lights`)

    fetch('http://homeassistant.local:8123/api/webhook/peeqo_lights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            room,
            action: lightAction
        })
    }).catch(err => {
        console.log('[HA] webhook error:', err)
    })

    const gifCategory = lightAction === 'on'
        ? 'lights_on'
        : lightAction === 'off'
            ? 'lights_off'
            : 'toggle'

    fetch(`http://192.168.1.182:5055/random/${gifCategory}`)
        .then(res => res.json())
        .then(gif => {
            console.log(`[MAC GIF] ${gifCategory}: ${gif.url}`)

            event.emit('set-answer', {
                type: 'url',
                url: gif.url,
                ans: '',
                loop: true,
                minDuration: 3000
            })
        })
        .catch(err => {
            console.log('[MAC GIF] error:', err)

            const pickedGifQuery = pickGifQuery(lightAction, gifQueries[lightAction])

            event.emit('set-answer', {
                type: 'remote',
                queryTerms: pickedGifQuery,
                loop: true,
                minDuration: 3000
            })
        })

    return true
}

function handleCameraCommand(transcript) {
    if (
        transcript.includes('take a photo') ||
        transcript.includes('take photo') ||
        transcript.includes('take a picture') ||
        transcript.includes('take picture') ||
        transcript.includes('take snapshot') ||
        transcript.includes('camera')
    ) {
        console.log('[PTT CAMERA] camera command detected:', transcript)
        event.emit('camera-photo')
        return true
    }

    return false
}

function handleDanceCommand(transcript) {
    if (
        transcript.includes('do a dance') ||
        transcript.includes('dance for me') ||
        transcript.includes('start dancing')
    ) {
        debug('[dance] explicit dance command received')

        event.emit('stop-media')
        event.emit('play-sound', 'alert.wav')
        event.emit('start-dance')

        setTimeout(() => {
            event.emit('stop-dance')
            event.emit('servo-reset')
        }, 8000)

        return true
    }

    return false
}

document.addEventListener('keydown', (e) => {
    if (e.repeat) return

    if (e.code === 'Space') {
        console.log('[PTT] space pressed')
        event.emit('wakeword')
    }

    // Temporary LED test keys
    if (e.key === '1') {
        console.log('[LED TEST] blink red')
        event.emit('led-on', { anim: 'blink', color: 'red' })
    }

    if (e.key === '2') {
        console.log('[LED TEST] blink aqua')
        event.emit('led-on', { anim: 'blink', color: 'aqua' })
    }

    if (e.key === '3') {
        console.log('[LED TEST] circle aqua')
        event.emit('led-on', { anim: 'circle', color: 'aqua' })
    }

    if (e.key === '4') {
        console.log('[LED TEST] circleOut purple')
        event.emit('led-on', { anim: 'circleOut', color: 'purple' })
    }

    if (e.key === '5') {
        console.log('[LED TEST] fadeOutError orange')
        event.emit('led-on', { anim: 'fadeOutError', color: 'orange' })
    }

    if (e.key === '0') {
        console.log('[LED TEST] off')
        event.emit('led-off')
    }
})

module.exports = () => {
    let mediaWasPaused = false

    const recEl = document.getElementById('status-recording')
    const loadEl = document.getElementById('status-loading')

    event.on('status-listening', () => {
        recEl.className = 'active'
        loadEl.className = ''
    })

    event.on('wakeword', () => {
        recEl.className = ''
    })

    event.on('start-dance', startDance)
    event.on('stop-dance', () => stopDance(true))

    event.on('show-div', (id) => {
        if (id === 'videoWrapper' || id === 'gifWrapper') {
            loadEl.className = ''
        }

        // Important:
        // Returning to eyeWrapper should not force a servo reset.
        // Sleep/wake/camera actions own their own servo motions.
        if (id === 'eyeWrapper') {
            stopDance(false)
        }

        // No automatic GIF servo move here.
        // This avoids fighting sleep/wake/camera servo actions.
    })

    event.on('set-answer', actions.setAnswer)

    event.on('wakeword', () => debug('[listeners] wakeword event received'))

    event.on('wakeword', () => {
        mediaWasPaused = true
        event.emit('pause-media')
    })

    event.on('wakeword', () => textBubble.hideBubble())
    event.on('wakeword', action.wakeword)

    event.on('wakeword', () => {
        event.emit('servo-move', 'alert')
        event.emit('play-sound', 'alert.wav')
    })

    event.on('wakeword', stt.prepare)
    event.on('wakeword', () => event.emit('speech-to-text'))

    event.on('final-transcript', () => {
        if (mediaWasPaused) {
            mediaWasPaused = false
            event.emit('stop-media')
        }
    })

    event.on('final-transcript', (data) => {
        const transcript = (data.text || '').toLowerCase()

        debug('[indicator] final-transcript:', transcript)
        loadEl.className = 'active'

        if (handleDanceCommand(transcript)) return
        if (handleLightsCommand(transcript)) return
        if (handleCameraCommand(transcript)) return

        if (transcript.includes('light')) {
            debug('[HA] skipping Claude for light command')
            return
        }

        claude.handleTranscript(data)
    })

    event.on('show-speech-bubble', (msg) => textBubble.showBubble(msg))

    event.on('no-command', () => {
        if (global.commandHandled) {
            global.commandHandled = false
            return
        }

        event.emit('led-on', { anim: 'fadeOutError', color: 'red' })
    })

    event.on('speech-to-text', () => debug('[listeners] speech-to-text event received'))
    event.on('speech-to-text', stt.startAudio)

    event.on('end-speech-to-text', () => {
        if (process.env.OS === 'unsupported') {
            document.getElementById('wakeword').style.backgroundColor = ''
        }

        if (mediaWasPaused) {
            mediaWasPaused = false
            event.emit('resume-media')
        }

        event.emit('mic-pause')
        event.emit('mic-resume')
    })

    event.on('show-div', common.showDiv)

    const webview = document.getElementById('webView')
    let currentWebUrl = null

    webview.addEventListener('did-fail-load', (e) => {
        if (e.errorCode === -3) return
        if (e.validatedURL !== currentWebUrl) return

        console.error(`[webview] failed to load (${e.errorCode}): ${e.errorDescription}`)

        currentWebUrl = null
        common.showDiv('eyeWrapper')
        webview.loadURL('about:blank')
    })

    event.on('show-web-page', (url) => {
        currentWebUrl = url
        webview.src = url
        common.showDiv('webWrapper')
    })

    event.on('clear-web-page', () => {
        currentWebUrl = null
        webview.loadURL('about:blank')
    })

    event.on('plane-overhead', (plane) => {
        console.log('[plane] reaction:', JSON.stringify(plane))

        const message = plane.airline
            ? `${plane.airline} ${plane.callsign}`
            : plane.callsign

        const overlay = document.getElementById('planeInfoOverlay')

        if (overlay) {
            overlay.style.display = 'none'
            overlay.innerHTML = ''
        }

        event.emit('servo-move', 'look-up-slow')
        speak.playSound('camera-toy.wav')

        event.emit('led-on', {
            anim: 'planeScan',
            color: 'blue'
        })

        fetch('http://192.168.1.182:5055/random/planes')
            .then(res => res.json())
            .then(gif => {
                console.log(`[MAC GIF] planes: ${gif.url}`)

                event.emit('set-answer', {
                    type: 'url',
                    url: gif.url,
                    ans: '',
                    loop: true,
                    minDuration: 4000
                })
            })
            .catch(err => {
                console.log('[MAC GIF] planes error:', err)

                event.emit('set-answer', {
                    type: 'remote',
                    queryTerms: 'airplane flying overhead',
                    loop: true,
                    minDuration: 4000
                })
            })

        setTimeout(() => {
            console.log('[plane] returning to eyes with caption')

            event.emit('show-div', 'eyeWrapper')
            event.emit('transition-eyes-back')

            if (overlay) {
                overlay.innerHTML = `
                    ✈ Plane overhead
                    <span class="small">${message}</span>
                    <span class="small">Altitude ${plane.altitudeText}</span>
                `
                overlay.style.display = 'block'
            } else {
                console.log('[plane] overlay element not found')
            }
        }, 6000)

        setTimeout(() => {
            console.log('[plane] clearing plane overlay')

            if (overlay) {
                overlay.style.display = 'none'
                overlay.innerHTML = ''
            }

            event.emit('led-off')
            event.emit('servo-reset')
        }, 16000)
    })

    event.on('shutdown', power.shutdown)
    event.on('reboot', power.reboot)
    event.on('refresh', power.refresh)

    event.on('mic-pause', () => mic.pause())
    event.on('mic-resume', () => {
        mic.resume()
        event.emit('pipe-to-wakeword')
    })

    event.on('play-sound', (data) => {
        speak.playSound(data)
    })

    event.on('set-volume', speak.setVolume)

    event.on('btn-16-short-press', () => {
        debug('[btn] 16 short press → refresh')
        power.refresh()
    })

    event.on('btn-16-long-press', () => {
        debug('[btn] 16 long press → shutdown')
        power.shutdown()
    })

    event.on('btn-4-short-press', () => {})
    event.on('btn-4-long-press', () => {})
    event.on('btn-17-short-press', () => {})
    event.on('btn-17-long-press', () => {})

    event.on('btn-23-long-press', () => {
        debug('[btn] 23 long press → restart peeqo')
        const { exec } = require('child_process')
        exec('pkill -f "electron ."')
    })

    let screenDimmed = false

    event.on('btn-23-short-press', () => {
        const dimmer = document.getElementById('screenDimmer')

        if (!dimmer) return

        screenDimmed = !screenDimmed

        if (screenDimmed) {
            dimmer.style.display = 'block'
            setTimeout(() => {
                dimmer.style.opacity = '0.9'
            }, 10)
        } else {
            dimmer.style.opacity = '0'
            setTimeout(() => {
                dimmer.style.display = 'none'
            }, 300)
        }
    })
}
