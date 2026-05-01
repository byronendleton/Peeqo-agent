const config = require('config/config.js')
const giphy = require('giphy-api')(config.giphy.key);
const { ipcRenderer } = require('electron');
const { GoogleAuth } = require('google-auth-library');
const path = require('path')
const fs = require('fs')
const https = require('https')

const youtubeAuth = new GoogleAuth({
	keyFilename: path.join(process.cwd(), 'app', 'config', config.speech.dialogflowKey),
	scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
})

async function youtubeGet(url) {
	const client = await youtubeAuth.getClient()
	const token = await client.getAccessToken()
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } })
	if (!res.ok) throw new Error(`YouTube API error (${res.status}): ${await res.text()}`)
	return res.json()
}

function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath)

        https.get(url, response => {
            response.pipe(file)

            file.on('finish', () => {
                file.close(() => resolve(filepath))
            })
        }).on('error', err => {
            fs.unlink(filepath, () => {})
            reject(err)
        })
    })
}

function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);

        https.get(url, response => {
            response.pipe(file);

            file.on('finish', () => {
                file.close(() => resolve(filepath));
            });
        }).on('error', err => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

async function findRemoteGif(query) {
    if (!query) return null;

    console.log("[GIPHY] function entered:", query);

    try {
        const url =
            `https://api.giphy.com/v1/gifs/search` +
            `?api_key=${config.giphy.key}` +
            `&q=${encodeURIComponent(query)}` +
            `&limit=10&rating=pg-13&lang=en`;

        console.log("[GIPHY] search:", query);

        const res = await fetch(url);
        const json = await res.json();

        if (!json.data || !json.data.length) {
            console.error("[GIPHY] no results:", json);
            return null;
        }

        const top = json.data.slice(0, 3);
        const chosen = top[Math.floor(Math.random() * top.length)];

        const gifUrl =
            chosen.images?.fixed_height?.url ||
            chosen.images?.downsized?.url ||
            chosen.images?.original?.url ||
            null;

        console.log("[GIPHY] chosen:", chosen.title);
        console.log("[GIPHY] gifUrl:", gifUrl);

        // 🔥 DOWNLOAD TO LOCAL FILE (this fixes black screen)
        const localPath = path.join(process.cwd(), 'app', 'media', 'giphy-cache.gif');

        await downloadFile(gifUrl, localPath);

        console.log("[GIPHY] saved locally:", localPath);

        return localPath;

    } catch (err) {
        console.error("[GIPHY] fetch failed:", err);
        return null;
    }
}


function parseISO8601Duration(iso) {
	const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
	if (!m) return 0
	return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0)
}

async function findRemoteVideo(query, maxDuration = null) {
	const effectiveMax = maxDuration || config.youtube.maxVideoDuration || 30
	const isLongForm = effectiveMax > 60

	// Short clips: sort by view count (popular/mainstream first), exclude Shorts, filter by duration.
	// Long form: sort by relevance (better for specific music/video requests), no duration filter.
	const order = isLongForm ? 'relevance' : 'viewCount'
	let searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(isLongForm ? query : query + ' -shorts')}&type=video&videoEmbeddable=true&maxResults=25&relevanceLanguage=en&regionCode=US&order=${order}`
	if (!isLongForm) searchUrl += '&videoDuration=short'

	const searchData = await youtubeGet(searchUrl)
	if (!searchData.items?.length) return null

	const ids = searchData.items.map(i => i.id.videoId).join(',')
	const firstId = searchData.items[0].id.videoId

	// Fire duration lookup and URL fetch for the first candidate in parallel.
	// The first search result is often the best match; if it passes the duration
	// filter its URL is already resolved before we even finish checking durations.
	const [detailData, firstUrl] = await Promise.all([
		youtubeGet(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}`),
		ipcRenderer.invoke('get-youtube-url', firstId).catch(() => null),
	])

	const valid = detailData.items.filter(v => {
		const secs = parseISO8601Duration(v.contentDetails.duration)
		return secs > 0 && secs <= effectiveMax
	})
	if (!valid.length) return null

	// Use the prefetched URL if the first result passed the duration filter
	if (firstUrl && valid.some(v => v.id === firstId)) return firstUrl

	// Otherwise try remaining valid candidates in random order
	const remaining = valid.filter(v => v.id !== firstId).sort(() => Math.random() - 0.5)
	for (const video of remaining) {
		try {
			const url = await ipcRenderer.invoke('get-youtube-url', video.id)
			if (url) return url
		} catch (err) {
			console.warn(`[media] skipping ${video.id}: ${err.message.split('\n')[0]}`)
		}
	}
	return null
}

async function findMediaType(filepath){

	if(!filepath){
		return null
	}

	// Strip query string before checking extension (YouTube CDN URLs have none)
	const ext = path.extname(filepath.split('?')[0]).toLowerCase()

	if([".png", ".jpg", ".jpeg"].includes(ext)) return "img"
	if([".mp4"].includes(ext)) return "video"
	if([".gif", ".webp"].includes(ext)) return "gif"

	// Extensionless remote URLs (e.g. YouTube CDN) — treat as video
	if(filepath.startsWith('http')) return "video"
}

async function findMediaDuration(path){
    if(!path){
        return null
    }

    let type = await findMediaType(path)

    let duration = 0

    if(type == 'video'){

        duration = await findVideoDuration(path)

    } else if (type == 'img' || type == 'gif') {

        return 6000;

    }

    return duration
}

async function findGifDuration(path){
    let gif = document.getElementById("gif")

    if (!gif) return 0

    gif.onload = () => console.log("[GIF] loaded:", gif.src)
    gif.onerror = (e) => console.error("[GIF] failed:", gif.src, e)

    gif.src = ""

    const src = path.includes("/app/media/")
        ? path.split("/app/")[1]
        : path

    setTimeout(() => {
        gif.src = src + (src.includes("?") ? "&" : "?") + "t=" + Date.now()
    }, 50)

    return 6000
}


async function findVideoDuration(path){

	if(!path){
		return null
	}

	let endPauseDuration = 1200
	let video = document.getElementById("video")
	video.src = path
	video.pause()

	const canplay = await new Promise((resolve, reject) => {
		video.addEventListener('canplay', (e)=>{
			resolve(e.returnValue)
		})
	})

	if(!canplay){
		return 0
	}

	let duration = video.duration*1000+endPauseDuration
	return duration
}


module.exports = {
	findRemoteGif,
	findRemoteVideo,
	findMediaType,
	findMediaDuration
}