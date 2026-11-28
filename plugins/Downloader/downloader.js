const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const log = (step, msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] [${step}] : ${msg}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function cleanFileName(name) {
    return String(name || 'Audio').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function isYouTubeUrl(str) {
    return /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(str);
}

async function fetchJsonRetry(url, tag, retries = 3, timeout = 30000) {
    let lastErr;
    for (let i = 1; i <= retries; i++) {
        try {
            log(tag, `API Attempt ${i}/${retries}...`);
            const { data } = await axios.get(url, { timeout, headers: { 'User-Agent': UA } });
            if (data?.status && data?.result) return data;
            throw new Error('Invalid API response');
        } catch (err) {
            lastErr = err;
            log(`${tag}-RETRY`, `Attempt ${i} failed: ${err.message}`);
            if (i < retries) await sleep(1000);
        }
    }
    throw new Error(lastErr?.message || `${tag} failed after ${retries} retries`);
}

async function downloadAudioBuffer(audioUrl, tag) {
    let lastErr;
    for (let i = 1; i <= 3; i++) {
        try {
            log(tag, `Downloading MP3 (${i}/3)...`);
            const res = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                maxRedirects: 5,
                maxContentLength: 60 * 1024 * 1024,
                headers: {
                    'User-Agent': UA,
                    'Accept': 'audio/mpeg,audio/*,*/*'
                },
                validateStatus: s => s >= 200 && s < 400
            });

            const contentType = res.headers['content-type'] || '';
            const buf = Buffer.from(res.data);

            if (buf.length > 5000 && !contentType.includes('text/html')) {
                log(tag, `Downloaded ${(buf.length / (1024 * 1024)).toFixed(2)} MB`);
                return buf;
            }
            throw new Error(`Invalid audio file (${contentType})`);
        } catch (err) {
            lastErr = err;
            log(`${tag}-RETRY`, `Download attempt ${i} failed: ${err.message}`);
            if (i < 3) await sleep(1200);
        }
    }
    throw new Error(lastErr?.message || 'Failed to download MP3 file');
}

module.exports = [
    // ==========================================
    // 📸 1. INSTAGRAM DOWNLOADER (With 3 Retries)
    // ==========================================
    {
        command: 'ig',
        aliases: ['insta', 'instagram', 'igdl', 'reel', 'reels'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, footerText }) {
            const from = msg.key.remoteJid;
            let query = args.join(' ').trim();

            if (!query) {
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsg) {
                    query = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
                    const match = query.match(/https?:\/\/(www\.)?instagram\.com\/[^\s]+/);
                    if (match) query = match[0];
                }
            }

            if (!query || !query.includes('instagram.com')) return reply('⚠️ *Provide a valid Instagram Reel or Post URL!*');

            log('IG-START', `Requested IG URL: ${query}`);
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            try {
                const apiURL = `https://kiraxmd-api.onrender.com/api/insta?url=${encodeURIComponent(query)}`;
                let data;

                for (let i = 1; i <= 3; i++) {
                    try {
                        const response = await axios.get(apiURL, { timeout: 30000 });
                        data = response.data;
                        break;
                    } catch (err) {
                        if (i === 3) throw new Error('API failed after 3 retries. Link might be invalid.');
                        log('IG-RETRY', `API fetch failed. Retrying... (${i}/3)`);
                        await sleep(1000);
                    }
                }

                if (!data || !data.status || !data.result || data.result.length === 0) {
                    throw new Error('Could not find any media. Make sure the account is public.');
                }

                const mediaList = data.result;
                const totalMedia = mediaList.length;
                const instaCaption = `*◈ ɴᴏʀᴀ ɪɴsᴛᴀ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n*⚡ ʜᴅ ᴅᴏᴡɴʟᴏᴀᴅ ✓*`;

                for (let i = 0; i < totalMedia; i++) {
                    let res;

                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            res = await axios.get(mediaList[i], {
                                responseType: 'arraybuffer',
                                timeout: 120000,
                                maxContentLength: 500 * 1024 * 1024,
                                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.instagram.com/' }
                            });
                            break;
                        } catch (err) {
                            if (attempt === 3) throw err;
                            log('IG-RETRY', `Media download failed. Retrying... (${attempt}/3)`);
                            await sleep(1500);
                        }
                    }

                    try {
                        if (res && res.status === 200 && res.data) {
                            const mediaBuffer = Buffer.from(res.data);
                            const sizeInMB = mediaBuffer.length / (1024 * 1024);
                            const contentType = res.headers['content-type'] || '';

                            if (contentType.includes('video')) {
                                if (sizeInMB > 50) {
                                    await sock.sendMessage(from, {
                                        document: mediaBuffer,
                                        mimetype: 'video/mp4',
                                        fileName: `IG_Video_${i + 1}.mp4`,
                                        caption: `📄 *sᴇɴᴛ ᴀs ᴅᴏᴄᴜᴍᴇɴᴛ (${sizeInMB.toFixed(1)}ᴍʙ)*\n\n` + instaCaption + footerText
                                    }, { quoted: msg });
                                } else {
                                    await sock.sendMessage(from, { video: mediaBuffer, caption: instaCaption + footerText }, { quoted: msg });
                                }
                            } else {
                                await sock.sendMessage(from, { image: mediaBuffer, caption: instaCaption + footerText }, { quoted: msg });
                            }
                        }
                    } catch (err) {
                        log('IG-ERROR', `Failed to send item: ${err.message}`);
                    }
                }
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (e) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${e.message}` + footerText }, { quoted: msg });
            }
        }
    },

    // ==========================================
    // 📘 2. FACEBOOK DOWNLOADER
    // ==========================================
    {
        command: 'fb',
        aliases: ['facebook', 'fbdl', 'fbvideo'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, footerText }) {
            const from = msg.key.remoteJid;
            let query = args.join(' ').trim();

            if (!query) {
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsg) {
                    query = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
                    const match = query.match(/https?:\/\/(www\.)?(facebook\.com|fb\.watch|fb\.gg)\/[^\s]+/);
                    if (match) query = match[0];
                }
            }

            if (!query || (!query.includes('fb') && !query.includes('facebook'))) return reply('⚠️ *Provide a valid Facebook Video URL!*');

            log('FB-START', `Requested FB URL: ${query}`);
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            try {
                const apiURL = `https://kiraxmd-api.onrender.com/api/fb?url=${encodeURIComponent(query)}`;
                const { data } = await axios.get(apiURL, { timeout: 30000 });

                if (!data || !data.status || !data.result) throw new Error('Could not fetch the Facebook video. Ensure the post is public.');
                const downloadUrl = data.result.hd || data.result.video || data.result.sd;
                if (!downloadUrl) throw new Error('Video download link not found.');

                const fbCaption = `*◈ ɴᴏʀᴀ ꜰʙ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n*⚡ ʜᴅ ᴅᴏᴡɴʟᴏᴀᴅ ✓*`;

                const res = await axios.get(downloadUrl, {
                    responseType: 'arraybuffer',
                    timeout: 180000,
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.facebook.com/' }
                });

                if (res.status === 200 && res.data) {
                    const mediaBuffer = Buffer.from(res.data);
                    const sizeInMB = mediaBuffer.length / (1024 * 1024);

                    if (sizeInMB > 50) {
                        await sock.sendMessage(from, {
                            document: mediaBuffer,
                            mimetype: 'video/mp4',
                            fileName: 'FB_Video.mp4',
                            caption: `📄 *sᴇɴᴛ ᴀs ᴅᴏᴄᴜᴍᴇɴᴛ (${sizeInMB.toFixed(1)}ᴍʙ)*\n\n` + fbCaption + footerText
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { video: mediaBuffer, caption: fbCaption + footerText }, { quoted: msg });
                    }
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                }
            } catch (e) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${e.message}` + footerText }, { quoted: msg });
            }
        }
    },

    // ==========================================
    // 📌 3. PINTEREST DOWNLOADER
    // ==========================================
    {
        command: 'pinterest',
        aliases: ['pin', 'pindl'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, footerText }) {
            const from = msg.key.remoteJid;
            let query = args.join(' ').trim();

            if (!query) {
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsg) {
                    query = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
                    const match = query.match(/https?:\/\/(www\.)?(pinterest\.com|pin\.it)\/[^\s]+/);
                    if (match) query = match[0];
                }
            }

            if (!query || (!query.includes('pinterest.com') && !query.includes('pin.it'))) return reply('⚠️ *Provide a valid Pinterest URL!*');

            log('PIN-START', `Requested Pinterest URL: ${query}`);
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            try {
                const apiURL = `https://kiraxmd-api.onrender.com/api/pinterest?url=${encodeURIComponent(query)}`;
                const { data } = await axios.get(apiURL, { timeout: 30000 });

                if (!data || !data.url) throw new Error('Could not fetch the Pinterest media.');
                const downloadUrl = data.url;

                const pinCaption = `*◈ ɴᴏʀᴀ ᴘɪɴᴛᴇʀᴇsᴛ ᴍᴇᴅɪᴀ*\n*⚡ ʜᴅ ᴅᴏᴡɴʟᴏᴀᴅ ✓*`;

                const res = await axios.get(downloadUrl, {
                    responseType: 'arraybuffer',
                    timeout: 120000,
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.pinterest.com/' }
                });

                if (res.status === 200 && res.data) {
                    const mediaBuffer = Buffer.from(res.data);
                    const sizeInMB = mediaBuffer.length / (1024 * 1024);
                    const contentType = res.headers['content-type'] || '';

                    if (contentType.includes('video') || downloadUrl.includes('.mp4')) {
                        if (sizeInMB > 50) {
                            await sock.sendMessage(from, {
                                document: mediaBuffer,
                                mimetype: 'video/mp4',
                                fileName: 'Pinterest_Video.mp4',
                                caption: `📄 *sᴇɴᴛ ᴀs ᴅᴏᴄᴜᴍᴇɴᴛ (${sizeInMB.toFixed(1)}ᴍʙ)*\n\n` + pinCaption + footerText
                            }, { quoted: msg });
                        } else {
                            await sock.sendMessage(from, { video: mediaBuffer, caption: pinCaption + footerText }, { quoted: msg });
                        }
                    } else {
                        await sock.sendMessage(from, { image: mediaBuffer, caption: pinCaption + footerText }, { quoted: msg });
                    }
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                }
            } catch (e) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${e.message}` + footerText }, { quoted: msg });
            }
        }
    }
];