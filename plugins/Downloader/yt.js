const API_BASE = (process.env.KIRAXMD_API || 'https://kiraxmd-api.onrender.com').replace(/\/+$/, '');

const YOUTUBE_HOSTS = new Set([
    'youtube.com', 'www.youtube.com', 'm.youtube.com',
    'music.youtube.com', 'youtu.be', 'www.youtu.be'
]);

function cleanName(name) {
    return String(name || 'YouTube_Media')
        .replace(/[\\/:*?"<>|\r\n]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100) || 'YouTube_Media';
}

function extractYoutubeUrl(text = '') {
    const match = String(text).match(/\bhttps?:\/\/\S+/i)?.[0];
    if (!match) return null;
    try {
        const u = new URL(match.replace(/[)\]\.,!?>]*$/, ''));
        const host = u.hostname.toLowerCase();
        if (!YOUTUBE_HOSTS.has(host)) return null;
        const [first, second] = u.pathname.split('/').filter(Boolean);
        let id = null;
        if (host.endsWith('youtu.be')) id = first;
        else if (first === 'watch') id = u.searchParams.get('v');
        else if (['shorts', 'live', 'embed', 'v'].includes(first)) id = second;
        return /^[\w-]{11}$/.test(id || '') ? `https://www.youtube.com/watch?v=${id}` : null;
    } catch {
        return null;
    }
}

function getQuotedText(msg) {
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    return (
        q?.conversation ||
        q?.extendedTextMessage?.text ||
        q?.imageMessage?.caption ||
        q?.videoMessage?.caption ||
        ''
    );
}

async function fetchJson(url, timeoutMs = 60000) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`API HTTP ${res.status}`);
    return await res.json();
}

async function searchYts(query, limit = 5) {
    const data = await fetchJson(`${API_BASE}/api/yts?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!data?.status || !Array.isArray(data.result) || !data.result.length) {
        throw new Error('No YouTube results found.');
    }
    return data.result;
}

module.exports = [
    {
        command: 'yt',
        aliases: ['ytv', 'ytmp4', 'video'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const raw = args.join(' ').trim() || getQuotedText(msg);
            const url = extractYoutubeUrl(raw);

            if (!url) {
                return reply(`⚠️ *Provide a valid YouTube link!*\n_Ex: ${prefix || '.'}yt https://youtu.be/..._`);
            }

            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            try {
                const data = await fetchJson(
                    `${API_BASE}/api/ytv2?url=${encodeURIComponent(url)}&quality=720`
                );
                const info = data?.result;
                if (!data?.status || !info?.download) {
                    throw new Error(data?.message || 'Could not fetch 720p video link.');
                }

                await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });

                const title = info.title || 'YouTube Video';
                const caption = `*${title}*\n\n*ɴᴏʀᴀ ʏᴛ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɴᴏʀᴀ_`;

                await sock.sendMessage(
                    from,
                    {
                        video: { url: info.download },
                        mimetype: 'video/mp4',
                        caption
                    },
                    { quoted: msg }
                );

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            }
        }
    },
    {
        command: 'play',
        aliases: ['yta', 'ytmp3', 'song', 'audio'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const query = args.join(' ').trim() || getQuotedText(msg);

            if (!query) {
                return reply(
                    `⚠️ *Provide a Song Name or YouTube Link!*\n` +
                    `_Ex: ${prefix || '.'}play dhol baaje_\n` +
                    `_Ex: ${prefix || '.'}play https://youtu.be/..._`
                );
            }

            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            try {
                let targetUrl = extractYoutubeUrl(query);

                if (!targetUrl) {
                    const results = await searchYts(query, 5);
                    targetUrl = results[0]?.url;
                    if (!targetUrl) throw new Error('No matching song found.');
                }

                const data = await fetchJson(
                    `${API_BASE}/api/yta?url=${encodeURIComponent(targetUrl)}`
                );
                const info = data?.result;
                if (!data?.status || !info?.audio_url) {
                    throw new Error(data?.message || 'Could not fetch audio link.');
                }

                await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });

                const title = cleanName(info.title || 'YouTube_Audio');

                await sock.sendMessage(
                    from,
                    {
                        audio: { url: info.audio_url },
                        mimetype: 'audio/mpeg',
                        ptt: false,
                        fileName: `${title}.mp3`
                    },
                    { quoted: msg }
                );

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            }
        }
    },
    {
        command: 'yts',
        aliases: ['ytsearch'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, prefix }) {
            const query = args.join(' ').trim();
            if (!query) return reply(`⚠️ *Provide a search query!*\n_Ex: ${prefix || '.'}yts dhol baaje_`);

            await sock.sendMessage(msg.key.remoteJid, { react: { text: '🔎', key: msg.key } });
            try {
                const results = await searchYts(query, 5);
                let out = `*◈ ʏᴏᴜᴛᴜʙᴇ ꜱᴇᴀʀᴄʜ*\n\n`;
                results.forEach((v, i) => {
                    out += `*${i + 1}. ${v.title}*\n⏱️ ${v.duration || 'N/A'} • 👤 ${v.channel || 'YouTube'}\n🔗 ${v.url}\n\n`;
                });
                await reply(out.trim());
            } catch (err) {
                reply(`❌ *Search failed:* ${err.message}`);
            }
        }
    }
];