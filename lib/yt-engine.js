const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const ffmpeg = require('fluent-ffmpeg');
const yts = require('yt-search');
const config = require('../config');

try {
    const ffmpegPath = require('ffmpeg-static');
    if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
} catch {}

const AUTH_FILE = path.join(__dirname, 'yt_auth.json');
const DEFAULT_YT_AUTH_B64 = 'ewogICJhY2Nlc3NfdG9rZW4iOiAieWEyOS5hMEFlaGZUT2xiLVJDck1mNXNpa2YtWHN4N1ZQZGd5YXBlWTZpQ1A3Q2lzdmdySEV6TlZkX1k1dHpNRXhHZ19aelZ6aDJGZGowR24tRUhzV1B5eE9rM2F5endjVndPR0didnR6aW1jSWVoZTY1Wk9NYkotS0s5MjVQa3R5WjBESXZEMWxnTUxwVXdzN3MxQkR0S0FFSDZjcFJmNnVrN1ZJTXRGTzEzY0lYQ2s3NWpVRnMtSEZOYTZJZXl5UllkN0VlMG1MeG1iU2FtMTNUYlBhM3pKc1lPNHVlQUVRYUNnWUtBZG9TQVJFU0ZRSEdYMk1pSkhsZnJBbHNyV0pqQmNHRUtpOU1JZzAyMjUiLAogICJyZWZyZXNoX3Rva2VuIjogIjEvLzBnaUkzXzBNc1NSWXpDZ1lJQVJBQUdCQVNTUUYtTDlJcm1Kd05vMXpsOWNyYWNnVElZR0M2NG1CN29JbUZkSlYySjlVQnk0R3ZqdmRQcU56SExDSXp3SHZSSlVSNnA4UnZ3OTFXYm9aMld6WlQ5UC1FYzJ2YkgxVFM3djgiLAogICJzY29wZSI6ICJodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL3lvdXR1YmUgaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC95b3V0dWJlLXBhaWQtY29udGVudCIsCiAgInRva2VuX3R5cGUiOiAiQmVhcmVyIiwKICAiZXhwaXJ5X2RhdGUiOiAiMjAyNi0xMS0yOVQwNzowMToyOS4zMzJaIgp9Cg==';
const BOTGUARD_REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const ANON_CLIENTS = ['ANDROID', 'IOS', 'WEB', 'MWEB', 'YTMUSIC'];
const DEVICE_FIELDS = ['deviceMake', 'deviceModel', 'osName', 'osVersion'];
const VIDEO_QUALITIES = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
const AUDIO_QUALITIES = ['AUDIO_QUALITY_HIGH', 'AUDIO_QUALITY_MEDIUM', 'AUDIO_QUALITY_LOW'];
const ANON_BLOCK_MS = 30 * 60 * 1000;
const IP_BLOCK_MS = 10 * 60 * 1000;
const INNERTUBE_TTL_MS = 30 * 60 * 1000;
const INFO_TTL_MS = 5 * 60 * 1000;

const PROFILES_URL =
    'https://gist.githubusercontent.com/Aswin-Sparky/6098b7bed31c07ca51019c8e81c06d7d/raw/70dc6449b802f98c4738caecfd882bde8145ad2f/tv_profile.json';

const PROFILE_FIELDS = {
    name: /^[\w.-]{1,40}$/,
    clientVersion: /^\d{1,2}(\.\d{1,10}){1,3}$/,
    userAgent: /^[\x20-\x7e]{1,300}$/,
    deviceMake: /^[\x20-\x7e]{1,60}$/,
    deviceModel: /^[\x20-\x7e]{1,60}$/,
    osName: /^[\x20-\x7e]{1,60}$/,
    osVersion: /^[\x20-\x7e]{1,60}$/
};

const BUILTIN_PROFILES = [
    {
        name: 'tv_samsung',
        clientVersion: '7.20260707.07.00',
        userAgent:
            'Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/2.4.0 TV Safari/538.1',
        deviceMake: 'Samsung',
        deviceModel: 'UKS9800',
        osName: 'Tizen',
        osVersion: '2.4.0'
    }
];

const YOUTUBE_HOSTS = new Set([
    'youtube.com', 'www.youtube.com', 'm.youtube.com',
    'music.youtube.com', 'youtu.be', 'www.youtu.be'
]);

const tempDir = () => {
    const dir = path.join(os.tmpdir(), 'nora_yt');
    fs.ensureDirSync(dir);
    return dir;
};

const stamp = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function cleanFileName(name) {
    return String(name || 'Media')
        .replace(/[\\/:*?"<>|\r\n]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 110) || 'Media';
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function youtubeUrlFrom(text) {
    const raw = String(text ?? '').match(/\bhttps?:\/\/\S+/i)?.[0];
    if (!raw) return null;
    let url;
    try {
        url = new URL(raw.replace(/[)\]\.,!?>]*$/, ''));
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return null;
    const [first, second] = url.pathname.split('/').filter(Boolean);
    let id = null;
    if (host.endsWith('youtu.be')) id = first;
    else if (first === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'live', 'embed', 'v'].includes(first)) id = second;
    return /^[\w-]{11}$/.test(id || '') ? `https://www.youtube.com/watch?v=${id}` : null;
}

function videoIdOf(url) {
    const text = String(url ?? '').trim();
    if (/^[\w-]{11}$/.test(text)) return text;
    return youtubeUrlFrom(text)?.match(/[?&]v=([\w-]{11})/)?.[1] || null;
}

async function cleanup(...files) {
    for (const f of files) {
        if (f && (await fs.pathExists(f))) await fs.remove(f).catch(() => {});
    }
}

// ==========================================
// 🔐 LOCAL, ENV & DEFAULT TV OAUTH STORAGE
// ==========================================
let cachedCreds = undefined;
let loginRunning = null;
const innertubes = new Map();

async function getCredentials() {
    if (cachedCreds !== undefined) return cachedCreds;
    try {
        if (process.env.YT_AUTH) {
            const data = JSON.parse(process.env.YT_AUTH);
            if (data && data.access_token) {
                cachedCreds = data;
                return cachedCreds;
            }
        }
        if (await fs.pathExists(AUTH_FILE)) {
            const data = await fs.readJSON(AUTH_FILE);
            if (data && data.access_token) {
                cachedCreds = data;
                return cachedCreds;
            }
        }
        if (DEFAULT_YT_AUTH_B64) {
            const data = JSON.parse(Buffer.from(DEFAULT_YT_AUTH_B64, 'base64').toString('utf8'));
            if (data && data.access_token) {
                cachedCreds = data;
                return cachedCreds;
            }
        }
    } catch {}
    cachedCreds = null;
    return null;
}

async function saveCredentials(creds) {
    cachedCreds = creds;
    await fs.writeJSON(AUTH_FILE, creds, { spaces: 2 }).catch(() => {});
    for (const key of innertubes.keys()) {
        if (key.startsWith('auth|')) innertubes.delete(key);
    }
}

async function logout() {
    cachedCreds = null;
    if (await fs.pathExists(AUTH_FILE)) await fs.remove(AUTH_FILE).catch(() => {});
    for (const key of innertubes.keys()) {
        if (key.startsWith('auth|')) innertubes.delete(key);
    }
}

async function isLoggedIn() {
    return !!(await getCredentials());
}

function login(onCode) {
    if (loginRunning) {
        loginRunning.code.then(onCode, () => {});
        return loginRunning.done;
    }
    let gotCode;
    const code = new Promise((resolve) => (gotCode = resolve));
    code.then(onCode, () => {});

    const done = (async () => {
        const { yt } = await loadLibs();
        const innertube = await yt.Innertube.create({
            cache: new yt.UniversalCache(false),
            generate_session_locally: true
        });
        const session = innertube.session;

        return new Promise((resolve, reject) => {
            let timer;
            session.once('auth-pending', (data) => {
                gotCode(data);
                timer = setTimeout(
                    () => reject(new Error('Login code expired. Run .ytlogin again.')),
                    ((data.expires_in || 1800) + 15) * 1000
                );
            });
            session.once('auth', async ({ credentials }) => {
                clearTimeout(timer);
                await saveCredentials(credentials).catch(() => {});
                resolve(credentials);
            });
            session.once('auth-error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
            session.signIn().catch(reject);
        });
    })().finally(() => {
        loginRunning = null;
    });

    loginRunning = { code, done };
    return done;
}

// ==========================================
// 🍪 COOKIES
// ==========================================
function parseNetscapeToHeader(content) {
    const pairs = [];
    for (const rawLine of String(content || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
        const cleaned = line.startsWith('#HttpOnly_') ? line.slice('#HttpOnly_'.length) : line;
        const cols = cleaned.split('\t');
        if (cols.length >= 7 && cols[5]) pairs.push(`${cols[5]}=${cols[6] ?? ''}`);
    }
    return pairs.join('; ');
}

function resolveCookieSource() {
    const configured = String(config.YT_COOKIE || process.env.YT_COOKIE || '').trim();
    if (configured && configured !== 'false') {
        if (!configured.includes('\n') && configured.length < 512 && fs.existsSync(configured)) {
            return { raw: fs.readFileSync(configured, 'utf8'), filePath: configured, isNetscape: true };
        }
        const isNetscape = configured.includes('\t') && configured.split(/\r?\n/).some((l) => l.split('\t').length >= 7);
        return { raw: configured, filePath: null, isNetscape };
    }
    for (const candidate of ['cookies.txt', 'yt_cookies.txt']) {
        const p = path.join(process.cwd(), candidate);
        if (fs.existsSync(p)) return { raw: fs.readFileSync(p, 'utf8'), filePath: p, isNetscape: true };
    }
    return null;
}

function getCookieHeader() {
    const src = resolveCookieSource();
    if (!src) return undefined;
    const header = src.isNetscape ? parseNetscapeToHeader(src.raw) : src.raw;
    return header || undefined;
}

// ==========================================
// 📦 LIBRARIES & BOTGUARD PO TOKEN
// ==========================================
let libsPromise = null;
function loadLibs() {
    return (libsPromise ??= (async () => {
        const [yt, sabr, gvUtils, botguard, webpo, bgUtils] = await Promise.all([
            import('youtubei.js'),
            import('googlevideo/sabr-stream'),
            import('googlevideo/utils'),
            import('bgutils-js/botguard'),
            import('bgutils-js/webpo'),
            import('bgutils-js/utils')
        ]);
        yt.Parser.setParserErrorHandler(() => {});
        yt.Platform.load({
            ...yt.Platform.shim,
            eval: (data) => new Function(typeof data === 'string' ? data : data.output)()
        });
        return { yt, SabrStream: sabr.SabrStream, gvUtils, botguard, webpo, bgUtils };
    })().catch((err) => {
        libsPromise = null;
        throw err;
    }));
}

let dom = null;
let botguardQueue = Promise.resolve();
function withDom(task) {
    const run = async () => {
        if (!dom) {
            const { JSDOM } = require('jsdom');
            dom = new JSDOM('<!DOCTYPE html><html><body></body></html>').window;
        }
        const saved = { window: globalThis.window, document: globalThis.document };
        globalThis.window = dom;
        globalThis.document = dom.document;
        try {
            return await task();
        } finally {
            for (const key of ['window', 'document']) {
                if (saved[key] === undefined) delete globalThis[key];
                else globalThis[key] = saved[key];
            }
        }
    };
    const result = botguardQueue.then(run, run);
    botguardQueue = result.catch(() => {});
    return result;
}

let minterEntry = null;
async function createMinter() {
    const { botguard, webpo, bgUtils } = await loadLibs();
    const challenge = await botguard.getChallenge({
        requestKey: BOTGUARD_REQUEST_KEY,
        fetchFunction: (url, init) => fetch(url, init)
    });
    const script = challenge?.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
    if (!script) throw new Error('BotGuard challenge missing script');

    const webPoSignalOutput = [];
    const snapshot = await withDom(async () => {
        new Function(script)();
        const client = await botguard.BotGuardClient.create({
            program: challenge.program,
            globalName: challenge.globalName,
            globalObject: globalThis
        });
        return client.snapshot({ webPoSignalOutput });
    });

    const res = await fetch(bgUtils.buildURL('GenerateIT'), {
        method: 'POST',
        headers: bgUtils.getHeaders(),
        body: JSON.stringify([BOTGUARD_REQUEST_KEY, snapshot]),
        signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`BotGuard HTTP ${res.status}`);
    const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = await res.json();
    if (!integrityToken) throw new Error('BotGuard returned no integrity token');

    const minter = await withDom(() =>
        webpo.WebPoMinter.create({ integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken }, webPoSignalOutput)
    );
    const ttl = Math.max(60, (estimatedTtlSecs || 0) - (mintRefreshThreshold || 0));
    return { minter, expiresAt: Date.now() + ttl * 1000 };
}

function currentMinter() {
    if (minterEntry && Date.now() < minterEntry.expiresAt) return minterEntry;
    const entry = { expiresAt: Infinity };
    entry.promise = createMinter().then(
        ({ minter, expiresAt }) => { entry.expiresAt = expiresAt; return minter; },
        (err) => { if (minterEntry === entry) minterEntry = null; throw err; }
    );
    minterEntry = entry;
    return entry;
}

const decodedLength = (token) =>
    !token ? 0 : typeof token === 'string' ? Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').length : token.length;

async function mintPoToken(videoId, websafe = true, { forceRefresh = false } = {}) {
    if (forceRefresh) minterEntry = null;
    let token;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt >= 1) minterEntry = null;
        const entry = currentMinter();
        const minter = await entry.promise;
        try {
            token = await withDom(() => (websafe ? minter.mintAsWebsafeString(videoId) : minter.mint(videoId)));
        } catch (err) {
            if (minterEntry === entry) minterEntry = null;
            throw err;
        }
        if (decodedLength(token) >= 64) break;
    }
    return token;
}

// ==========================================
// 📺 INNERTUBE CLIENTS & REMOTE TV PROFILES
// ==========================================
function parseProfiles(data) {
    const list = Array.isArray(data) ? data : data?.profiles;
    if (!Array.isArray(list)) return [];
    const profiles = [];
    for (const entry of list.slice(0, 10)) {
        const profile = {};
        for (const [field, pattern] of Object.entries(PROFILE_FIELDS)) {
            if (typeof entry?.[field] === 'string' && pattern.test(entry[field])) profile[field] = entry[field];
        }
        if (profile.name && profile.clientVersion && profile.userAgent && !profiles.some((p) => p.name === profile.name)) {
            profiles.push(profile);
        }
    }
    return profiles;
}

let remoteProfiles = [];
let nextProfilesFetch = 0;
let profilesFetch = null;

function refreshProfiles(url) {
    profilesFetch ??= (async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.length > 64 * 1024) throw new Error('file too large');
        const profiles = parseProfiles(JSON.parse(text));
        if (!profiles.length) throw new Error('no valid profiles');
        remoteProfiles = profiles;
        nextProfilesFetch = Date.now() + 60 * 60 * 1000;
    })()
        .catch(() => { nextProfilesFetch = Date.now() + 5 * 60 * 1000; })
        .finally(() => { profilesFetch = null; });
    return profilesFetch;
}

async function tvProfiles() {
    const url = String(config.YT_PROFILES_URL || process.env.YT_PROFILES_URL || PROFILES_URL).trim();
    if (url && Date.now() >= nextProfilesFetch) {
        const pending = refreshProfiles(url);
        if (nextProfilesFetch === 0) await pending;
    }
    return [...remoteProfiles, ...BUILTIN_PROFILES.filter((b) => !remoteProfiles.some((p) => p.name === b.name))];
}

let ytCache = null;

async function innertubeFor(clientKey, credentials = null, profile = null) {
    const { yt } = await loadLibs();
    const key = credentials ? `auth|${profile?.name || 'tv'}` : `anon|${clientKey}|${getCookieHeader() || ''}`;
    const hit = innertubes.get(key);
    if (hit && Date.now() - hit.at < INNERTUBE_TTL_MS) return hit.promise;

    ytCache ??= new yt.UniversalCache(false);
    const promise = (async () => {
        const innertube = await yt.Innertube.create({
            cache: ytCache,
            cookie: credentials ? undefined : getCookieHeader(),
            generate_session_locally: true,
            retrieve_player: true,
            client_type: yt.Constants.CLIENTS[clientKey].NAME,
            user_agent: profile?.userAgent
        });
        if (profile) {
            const client = innertube.session.context.client;
            client.clientVersion = profile.clientVersion;
            client.userAgent = profile.userAgent;
            for (const field of DEVICE_FIELDS) {
                if (profile[field]) client[field] = profile[field];
                else delete client[field];
            }
        }
        if (credentials) {
            innertube.session.on('update-credentials', ({ credentials: fresh }) => {
                saveCredentials(fresh).catch(() => {});
            });
            await innertube.session.signIn({ ...credentials });
        }
        return innertube;
    })();
    promise.catch(() => innertubes.delete(key));
    innertubes.set(key, { at: Date.now(), promise });
    return promise;
}

const isBotCheck = (err) => /LOGIN_REQUIRED|not a bot/i.test(err.message);
const isFinal = (err) => err.playability && !['LOGIN_REQUIRED', 'UNPLAYABLE', 'AGE_CHECK_REQUIRED'].includes(err.playability);
const isIpBlock = (err) => /youtubei\/v1\/\S* failed with status code 403/i.test(err.message);

let anonBlockedUntil = 0;
let ipBlockedUntil = 0;

async function withClients(fn) {
    if (Date.now() < ipBlockedUntil) {
        const e = new Error('YouTube refuses this server IP (HTTP 403).');
        e.code = 'YT_IP_BLOCKED';
        throw e;
    }

    const credentials = await getCredentials();
    const attempts = [];
    if (credentials) {
        for (const profile of await tvProfiles()) {
            attempts.push({ label: `${profile.name} (login)`, client: 'TV', credentials, profile });
        }
    }
    if (!credentials || Date.now() > anonBlockedUntil) {
        for (const client of ANON_CLIENTS) attempts.push({ label: client, client, credentials: null, profile: null });
    }

    const failures = [];
    const ipBlocked = { anon: false, login: false };
    const groupOf = (a) => (a.credentials ? 'login' : 'anon');

    for (const attempt of attempts) {
        if (ipBlocked[groupOf(attempt)]) continue;
        try {
            return await fn(attempt);
        } catch (err) {
            failures.push({ attempt, err });
            if (credentials && !attempt.credentials && isBotCheck(err)) anonBlockedUntil = Date.now() + ANON_BLOCK_MS;
            if (isIpBlock(err)) ipBlocked[groupOf(attempt)] = true;
            if (isFinal(err)) break;
        }
    }

    if (failures.length && failures.every(({ err }) => isIpBlock(err))) {
        ipBlockedUntil = Date.now() + IP_BLOCK_MS;
        throw new Error('YouTube blocked this server IP (HTTP 403).');
    }
    if (!credentials && failures.some(({ err }) => isBotCheck(err))) {
        throw new Error('YouTube service temporarily unavailable. Please try again later.');
    }
    throw new Error(failures.at(-1)?.err.message || 'YouTube request failed');
}

// ==========================================
// 🎞️ FORMAT PICKERS & FAST INFO
// ==========================================
const labelOf = (format) => {
    const height = /^(\d+)p/.exec(format.qualityLabel || format.quality_label || '')?.[1];
    return height ? `${height}p` : undefined;
};

function nearest(wanted, available, order) {
    if (available.includes(wanted)) return wanted;
    const at = order.indexOf(wanted);
    if (at === -1) return available[0];
    return order.slice(at + 1).find((q) => available.includes(q)) || order.slice(0, at).reverse().find((q) => available.includes(q));
}

function codecRank(mime = '') {
    if (mime.includes('avc1')) return 0;
    if (mime.includes('vp9') || mime.includes('vp09')) return 1;
    if (mime.includes('av01')) return 2;
    return 3;
}

function pickVideo(formats, wanted = '360p') {
    const all = formats.filter((f) => f.hasVideo || f.has_video);
    const sdr = all.filter((f) => !f.isHdr && !/hdr/i.test(f.quality_label || ''));
    const pool = sdr.length ? sdr : all;
    const label = nearest(wanted, [...new Set(pool.map(labelOf).filter(Boolean))], VIDEO_QUALITIES);
    if (!label) return undefined;
    return pool
        .filter((f) => labelOf(f) === label)
        .sort((a, b) => codecRank(a.mimeType || a.mime_type) - codecRank(b.mimeType || b.mime_type) || (b.bitrate || 0) - (a.bitrate || 0))[0];
}

function pickAudio(formats) {
    const all = formats.filter((f) => (f.hasAudio || f.has_audio) && !(f.hasVideo || f.has_video));
    const original = all.filter((f) => f.isOriginal !== false && !f.isDrc && !f.is_drc);
    const pool = original.length ? original : all;
    const quality = nearest('AUDIO_QUALITY_MEDIUM', [...new Set(pool.map((f) => f.audioQuality || f.audio_quality).filter(Boolean))], AUDIO_QUALITIES);
    if (!quality) return pool[0];
    const aac = (f) => Number((f.mimeType || f.mime_type)?.includes('mp4a'));
    return pool
        .filter((f) => (f.audioQuality || f.audio_quality) === quality)
        .sort((a, b) => aac(b) - aac(a) || (b.bitrate || 0) - (a.bitrate || 0))[0];
}

const extOf = (mime = '') => (mime.includes('webm') ? 'webm' : mime.startsWith('audio/') ? 'm4a' : 'mp4');

const infoCache = new Map();
async function getVideoInfo(urlOrId) {
    const videoId = videoIdOf(urlOrId);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const hit = infoCache.get(videoId);
    if (hit && Date.now() - hit.at < INFO_TTL_MS) return hit.value;

    const value = await withClients(async ({ client, credentials, profile }) => {
        const innertube = await innertubeFor(client, credentials, profile);
        const infoObj = await innertube.getBasicInfo(videoId);
        const pageObj = Array.isArray(infoObj.page) ? infoObj.page[0] : infoObj.page;
        const status = pageObj?.playability_status;
        if (status?.status !== 'OK') {
            const err = new Error(`${status?.status || 'UNPLAYABLE'}${status?.reason ? ` (${status.reason})` : ''}`);
            err.playability = status?.status;
            throw err;
        }

        const basic = { ...pageObj?.video_details, ...Object.fromEntries(Object.entries(infoObj.basic_info || {}).filter(([, v]) => v != null)) };
        const formats = (pageObj?.streaming_data?.adaptive_formats || []).map((f) => ({
            hasVideo: !!f.has_video,
            hasAudio: !!f.has_audio,
            mimeType: f.mime_type,
            qualityLabel: f.quality_label,
            audioQuality: f.audio_quality,
            bitrate: f.bitrate,
            size: Number(f.content_length) || 0,
            isHdr: /hdr/i.test(f.quality_label || ''),
            isDrc: !!f.is_drc,
            isOriginal: f.audio_track ? !!f.audio_track.audio_is_default : true
        }));

        const labels = [...new Set(formats.filter((f) => f.hasVideo).map(labelOf).filter(Boolean))]
            .filter((q) => VIDEO_QUALITIES.includes(q))
            .sort((a, b) => parseInt(b) - parseInt(a));

        const audio = pickAudio(formats);
        const options = labels.map((quality) => ({
            quality,
            size: (pickVideo(formats, quality)?.size || 0) + (audio?.size || 0)
        }));
        if (audio) options.push({ audio: true, size: audio.size || 0 });

        return {
            videoId,
            title: basic.title || 'YouTube Video',
            author: basic.author || 'YouTube',
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            options
        };
    });

    infoCache.set(videoId, { at: Date.now(), value });
    if (infoCache.size > 60) infoCache.delete(infoCache.keys().next().value);
    return value;
}

// ==========================================
// ⚡ TURBO DIRECT CDN DOWNLOAD (NO SABR THROTTLE!)
// ==========================================
async function fetchToFile(url, outPath, innertube) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': innertube?.session?.context?.client?.userAgent || 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        },
        signal: AbortSignal.timeout(45000)
    });
    if (!res.ok || !res.body) throw new Error(`CDN HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(outPath));
    const stat = await fs.stat(outPath);
    if (!stat.size) throw new Error('Empty file from CDN');
}

async function directCdnDownload({ client, credentials, profile }, videoId, kind = 'audio', quality = '360p') {
    const innertube = await innertubeFor(client, credentials, profile);
    const infoObj = await innertube.getBasicInfo(videoId);
    const pageObj = Array.isArray(infoObj.page) ? infoObj.page[0] : infoObj.page;
    const status = pageObj?.playability_status;
    if (status?.status !== 'OK') {
        const err = new Error(`${status?.status || 'UNPLAYABLE'}${status?.reason ? ` (${status.reason})` : ''}`);
        err.playability = status?.status;
        throw err;
    }

    const title = pageObj?.video_details?.title || infoObj?.basic_info?.title || 'YouTube';
    const base = path.join(tempDir(), `${videoId}_${stamp()}`);

    // 1. Check for instant pre-muxed MP4 (e.g. 360p) — 1 single HTTP download, 0 FFmpeg needed!
    if (kind === 'video') {
        const muxedFormats = pageObj?.streaming_data?.formats || [];
        const targetMuxed = muxedFormats.find((f) => labelOf(f) === quality && (f.url || f.signature_cipher));
        if (targetMuxed) {
            const directUrl = targetMuxed.url || (await targetMuxed.decipher(innertube.session.player));
            if (directUrl) {
                const outPath = `${base}_muxed.mp4`;
                await fetchToFile(directUrl, outPath, innertube);
                return {
                    title,
                    audioPath: outPath,
                    videoPath: outPath,
                    videoMime: targetMuxed.mime_type || 'video/mp4; codecs="avc1"',
                    preMuxed: true,
                    quality
                };
            }
        }
    }

    // 2. Direct Adaptive CDN Streams (Fast parallel HTTPS download without SABR throttle)
    const adaptive = pageObj?.streaming_data?.adaptive_formats || [];
    const audioFmt = pickAudio(adaptive);
    const videoFmt = kind === 'video' ? pickVideo(adaptive, quality) : undefined;
    if (!audioFmt) throw new Error('No adaptive audio format');
    if (kind === 'video' && !videoFmt) throw new Error('No adaptive video format');

    const audioUrl = audioFmt.url || (await audioFmt.decipher(innertube.session.player));
    const videoUrl = videoFmt ? (videoFmt.url || (await videoFmt.decipher(innertube.session.player))) : null;
    if (!audioUrl || (kind === 'video' && !videoUrl)) {
        throw new Error('No direct CDN URLs (needs SABR)');
    }

    const audioPath = `${base}_a.${extOf(audioFmt.mime_type)}`;
    const videoPath = videoFmt ? `${base}_v.${extOf(videoFmt.mime_type)}` : null;

    try {
        await Promise.all([
            fetchToFile(audioUrl, audioPath, innertube),
            videoPath && fetchToFile(videoUrl, videoPath, innertube)
        ]);
    } catch (err) {
        await cleanup(audioPath, videoPath);
        throw err;
    }

    return {
        title,
        audioPath,
        audioMime: audioFmt.mime_type,
        videoPath,
        videoMime: videoFmt?.mime_type,
        preMuxed: false,
        quality: videoFmt ? labelOf(videoFmt) : null
    };
}

// ==========================================
// ⬇️ SABR STREAM FALLBACK (If direct CDN returns 403)
// ==========================================
async function sabrDownload({ client, credentials, profile }, videoId, kind = 'audio', quality = '360p') {
    const { yt, SabrStream, gvUtils } = await loadLibs();
    const innertube = await innertubeFor(client, credentials, profile);
    const withPoToken = !credentials;
    const poToken = withPoToken ? await mintPoToken(videoId) : undefined;

    const loadPlayer = async (tokenOverride = poToken) => {
        const infoObj = await innertube.getBasicInfo(videoId, tokenOverride ? { po_token: tokenOverride } : undefined);
        const pageObj = Array.isArray(infoObj.page) ? infoObj.page[0] : infoObj.page;
        const status = pageObj?.playability_status;
        if (status?.status !== 'OK') {
            const err = new Error(`${status?.status || 'UNPLAYABLE'}${status?.reason ? ` (${status.reason})` : ''}`);
            err.playability = status?.status;
            throw err;
        }
        const url = pageObj.streaming_data?.server_abr_streaming_url;
        const ustreamer = pageObj.player_config?.media_common_config?.media_ustreamer_request_config?.video_playback_ustreamer_config;
        if (!url || !ustreamer) throw new Error('No SABR stream in player response');
        return {
            info: infoObj,
            page: pageObj,
            serverAbrStreamingUrl: await innertube.session.player.decipher(url),
            videoPlaybackUstreamerConfig: ustreamer
        };
    };

    const player = await loadPlayer();
    const formats = player.page.streaming_data.adaptive_formats.map(gvUtils.buildSabrFormat);
    const audioFormat = pickAudio(formats);
    const videoFormat = kind === 'video' ? pickVideo(formats, quality) : undefined;
    if (!audioFormat) throw new Error('No audio format found');
    if (kind === 'video' && !videoFormat) throw new Error('No video format found');

    const context = innertube.session.context.client;
    const stream = new SabrStream({
        videoId,
        formats,
        serverAbrStreamingUrl: player.serverAbrStreamingUrl,
        videoPlaybackUstreamerConfig: player.videoPlaybackUstreamerConfig,
        clientInfo: {
            clientName: parseInt(yt.Constants.CLIENT_NAME_IDS[context.clientName]),
            clientVersion: context.clientVersion,
            ...Object.fromEntries(DEVICE_FIELDS.filter((f) => context[f]).map((f) => [f, context[f]]))
        },
        poToken,
        fetchFunction: (url, init) => innertube.session.http.fetch(url, init),
        callbacks: {
            onMintPoToken: withPoToken ? () => mintPoToken(videoId, false, { forceRefresh: true }) : undefined,
            onReloadPlayerResponse: async () => {
                const freshToken = withPoToken ? await mintPoToken(videoId, true, { forceRefresh: true }) : undefined;
                const { serverAbrStreamingUrl, videoPlaybackUstreamerConfig } = await loadPlayer(freshToken);
                return { serverAbrStreamingUrl, videoPlaybackUstreamerConfig };
            }
        }
    });

    const base = path.join(tempDir(), `${videoId}_${stamp()}`);
    const audioPath = `${base}_a.${extOf(audioFormat.mimeType)}`;
    const videoPath = videoFormat ? `${base}_v.${extOf(videoFormat.mimeType)}` : null;

    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            stream.abort().catch(() => {});
            reject(new Error('SABR download timed out (45s)'));
        }, 45000);
    });

    try {
        const downloadTask = (async () => {
            const { audioStream, videoStream } = await stream.start({
                audioFormat,
                videoFormat,
                enabledTrackTypes: videoFormat ? gvUtils.EnabledTrackTypes.VIDEO_AND_AUDIO : gvUtils.EnabledTrackTypes.AUDIO_ONLY
            });
            await Promise.all([
                pipeline(Readable.fromWeb(audioStream), fs.createWriteStream(audioPath)),
                videoPath && pipeline(Readable.fromWeb(videoStream), fs.createWriteStream(videoPath))
            ]);
        })();

        await Promise.race([downloadTask, timeoutPromise]);
        if (!fs.statSync(audioPath).size) throw new Error('Downloaded audio stream is empty');
    } catch (err) {
        stream.abort().catch(() => {});
        await cleanup(audioPath, videoPath);
        throw err;
    } finally {
        clearTimeout(timeoutHandle);
    }

    const title = player.page?.video_details?.title || player.info?.basic_info?.title || 'YouTube';
    return {
        title,
        audioPath,
        audioMime: audioFormat.mimeType,
        videoPath,
        videoMime: videoFormat?.mimeType,
        preMuxed: false,
        quality: videoFormat ? labelOf(videoFormat) : null
    };
}

async function smartDownload(videoId, kind, quality) {
    return await withClients(async (attempt) => {
        try {
            return await directCdnDownload(attempt, videoId, kind, quality);
        } catch {
            return await sabrDownload(attempt, videoId, kind, quality);
        }
    });
}

async function downloadAudio(urlOrId) {
    const videoId = videoIdOf(urlOrId);
    if (!videoId) throw new Error('Invalid YouTube URL');
    const dl = await smartDownload(videoId, 'audio');

    const isWebm = dl.audioPath.endsWith('.webm');
    const outPath = path.join(tempDir(), `aud_${stamp()}.${isWebm ? 'mp3' : 'm4a'}`);
    try {
        await new Promise((resolve, reject) => {
            const cmd = ffmpeg(dl.audioPath).outputOption('-map', '0:a');
            if (isWebm) cmd.outputOptions(['-c:a', 'libmp3lame', '-q:a', '2']);
            else cmd.outputOptions(['-c:a', 'copy', '-movflags', '+faststart']);
            cmd.on('end', resolve).on('error', reject).save(outPath);
        });
        await cleanup(dl.audioPath);
        return {
            path: outPath,
            title: cleanFileName(dl.title),
            mimetype: isWebm ? 'audio/mpeg' : 'audio/mp4',
            ext: isWebm ? 'mp3' : 'm4a'
        };
    } catch {
        await cleanup(outPath);
        return {
            path: dl.audioPath,
            title: cleanFileName(dl.title),
            mimetype: isWebm ? 'audio/webm' : 'audio/mp4',
            ext: isWebm ? 'webm' : 'm4a'
        };
    }
}

async function downloadVideo(urlOrId, quality = '360p') {
    const videoId = videoIdOf(urlOrId);
    if (!videoId) throw new Error('Invalid YouTube URL');
    const target = /p$/i.test(quality) ? quality.toLowerCase() : `${quality}p`;
    const dl = await smartDownload(videoId, 'video', target);

    if (dl.preMuxed && dl.videoPath) {
        return {
            path: dl.videoPath,
            title: cleanFileName(dl.title),
            quality: dl.quality || target,
            playable: true
        };
    }

    const outPath = path.join(tempDir(), `vid_${stamp()}.mp4`);
    try {
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(dl.videoPath)
                .input(dl.audioPath)
                .outputOptions(['-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart'])
                .on('end', resolve)
                .on('error', reject)
                .save(outPath);
        });
    } catch (err) {
        await cleanup(outPath);
        throw err;
    } finally {
        await cleanup(dl.videoPath, dl.audioPath);
    }

    return {
        path: outPath,
        title: cleanFileName(dl.title),
        quality: dl.quality || target,
        playable: Boolean(dl.videoMime?.includes('avc1'))
    };
}

async function searchYoutube(query, limit = 5) {
    const res = await yts(query);
    return (res.videos || []).slice(0, limit).map((v) => ({
        id: v.videoId,
        title: v.title,
        url: v.url,
        duration: v.timestamp || 'N/A',
        views: v.views || 0,
        thumbnail: v.thumbnail,
        author: v.author?.name || 'YouTube'
    }));
}

module.exports = {
    searchYoutube,
    getVideoInfo,
    downloadAudio,
    downloadVideo,
    youtubeUrlFrom,
    videoIdOf,
    formatBytes,
    cleanFileName,
    cleanup,
    login,
    logout,
    isLoggedIn
};