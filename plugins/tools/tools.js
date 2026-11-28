const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const NORA_FOOTER = '_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɴᴏʀᴀ_';

const log = (step, msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] [TOOLS-${step}] : ${msg}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, tag, retries = 3, timeout = 30000) {
    let lastErr;
    for (let i = 1; i <= retries; i++) {
        try {
            log(tag, `API Attempt ${i}/${retries}...`);
            const { data } = await axios.get(url, { timeout });
            if (data && data.status && data.result) {
                return data;
            }
            throw new Error('Invalid API response format');
        } catch (err) {
            lastErr = err;
            log(`${tag}-RETRY`, `Attempt ${i} failed (${err.message})`);
            if (i < retries) await sleep(1200);
        }
    }
    throw new Error(lastErr?.message || 'API failed after 3 retries');
}

function unwrapBasic(m) {
    if (!m) return null;
    if (m.ephemeralMessage) return unwrapBasic(m.ephemeralMessage.message);
    if (m.documentWithCaptionMessage) return unwrapBasic(m.documentWithCaptionMessage.message);
    return m;
}

function unwrapAll(m) {
    if (!m) return null;
    if (m.ephemeralMessage) return unwrapAll(m.ephemeralMessage.message);
    if (m.viewOnceMessage) return unwrapAll(m.viewOnceMessage.message);
    if (m.viewOnceMessageV2) return unwrapAll(m.viewOnceMessageV2.message);
    if (m.viewOnceMessageV2Extension) return unwrapAll(m.viewOnceMessageV2Extension.message);
    if (m.documentWithCaptionMessage) return unwrapAll(m.documentWithCaptionMessage.message);
    return m;
}

async function downloadToTemp(mediaMsg, mediaType, ext) {
    const tempFile = path.join(os.tmpdir(), `nova_tool_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`);
    const stream = await downloadContentFromMessage(mediaMsg, mediaType);
    const writeStream = fs.createWriteStream(tempFile);
    await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on('error', reject);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
    return tempFile;
}

async function cleanup(...files) {
    for (const f of files) {
        if (f && await fs.pathExists(f)) await fs.remove(f).catch(() => {});
    }
}

async function uploadMediaUrl(filePath, fileName) {
    const fileBuf = await fs.readFile(filePath);
    const blob = new Blob([fileBuf]);

    try {
        log('URL-CATBOX', 'Uploading to Catbox (1/1)...');
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', blob, fileName);

        const res = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: form,
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(20000)
        });
        const text = (await res.text()).trim();
        if (res.ok && text.startsWith('http')) {
            log('URL-CATBOX', `Success: ${text}`);
            return { url: text, host: 'Catbox' };
        }
        throw new Error(text || `HTTP ${res.status}`);
    } catch (err) {
        log('URL-CATBOX-FAIL', `Failed (${err.message}). Switching to Uguu...`);
    }

    for (let i = 1; i <= 3; i++) {
        try {
            log('URL-UGUU', `Uploading to Uguu (${i}/3)...`);
            const form = new FormData();
            form.append('files[]', blob, fileName);

            const res = await fetch('https://uguu.se/upload', {
                method: 'POST',
                body: form,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(30000)
            });

            const data = await res.json();
            if (data?.success && data?.files?.[0]?.url) {
                log('URL-UGUU', `Success: ${data.files[0].url}`);
                return { url: data.files[0].url, host: 'Uguu' };
            }
            throw new Error('Invalid Uguu response');
        } catch (err) {
            log('URL-UGUU-RETRY', `Attempt ${i} failed: ${err.message}`);
            if (i < 3) await sleep(1200);
        }
    }

    throw new Error('Upload failed on both Catbox and Uguu.');
}

const LANG_MAP = {
    ml: 'Malayalam', malayalam: 'ml',
    en: 'English', english: 'en',
    hi: 'Hindi', hindi: 'hi',
    ta: 'Tamil', tamil: 'ta',
    te: 'Telugu', telugu: 'te',
    kn: 'Kannada', kannada: 'kn',
    ar: 'Arabic', arabic: 'ar',
    ja: 'Japanese', japanese: 'ja',
    ko: 'Korean', korean: 'ko',
    'zh-cn': 'Chinese', chinese: 'zh-CN', zh: 'zh-CN',
    es: 'Spanish', spanish: 'es',
    fr: 'French', french: 'fr',
    de: 'German', german: 'de',
    ru: 'Russian', russian: 'ru',
    pt: 'Portuguese', portuguese: 'pt',
    it: 'Italian', italian: 'it',
    tr: 'Turkish', turkish: 'tr',
    id: 'Indonesian', indonesian: 'id',
    ur: 'Urdu', urdu: 'ur',
    bn: 'Bengali', bengali: 'bn',
    ne: 'Nepali', nepali: 'ne', nepal: 'ne'
};

const VALID_CODES = {
    ml: 'Malayalam', en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu',
    kn: 'Kannada', ar: 'Arabic', ja: 'Japanese', ko: 'Korean', 'zh-CN': 'Chinese',
    es: 'Spanish', fr: 'French', de: 'German', ru: 'Russian', pt: 'Portuguese',
    it: 'Italian', tr: 'Turkish', id: 'Indonesian', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali'
};

function resolveLangCode(input) {
    if (!input) return null;
    const key = input.toLowerCase().trim();
    if (key === 'zh-cn') return 'zh-CN';
    if (VALID_CODES[key]) return key;
    if (LANG_MAP[key] && VALID_CODES[LANG_MAP[key]]) return LANG_MAP[key];
    return null;
}

module.exports = [
    // 🖼️ 1. GETPP
    {
        command: 'getpp',
        aliases: ['pp', 'dp'],
        category: 'tools',
        async execute(sock, msg, args, { reply, prefix, sender }) {
            const from = msg.key.remoteJid;
            const ctx = msg.message?.extendedTextMessage?.contextInfo;

            let targetJid = null;

            if (args.length > 0) {
                const digits = args.join('').replace(/[^0-9]/g, '');
                if (digits.length >= 7) {
                    targetJid = `${digits}@s.whatsapp.net`;
                }
            } else if (ctx?.mentionedJid?.length > 0) {
                targetJid = ctx.mentionedJid[0];
            } else if (ctx?.participant) {
                targetJid = ctx.participant;
            } else {
                targetJid = sender;
            }

            if (!targetJid) {
                return reply(`⚠️ *ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ!*\n_ᴇx: ${prefix}getpp 919876543210_`);
            }

            log('GETPP', `Fetching PP for: ${targetJid}`);
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            try {
                let ppUrl = null;
                for (let i = 1; i <= 3; i++) {
                    try {
                        ppUrl = await sock.profilePictureUrl(targetJid, 'image');
                        if (ppUrl) break;
                    } catch (err) {
                        log('GETPP-RETRY', `Attempt ${i}/3 failed: ${err.message}`);
                        if (i === 3) throw err;
                        await sleep(800);
                    }
                }

                await sock.sendMessage(from, {
                    image: { url: ppUrl },
                    caption: `*👤 ᴘʀᴏꜰɪʟᴇ ᴘɪᴄᴛᴜʀᴇ*\n*ɴᴜᴍʙᴇʀ:* +${targetJid.split('@')[0]}\n\n${NORA_FOOTER}`
                }, { quoted: msg });

                log('GETPP-SUCCESS', `Sent PP for ${targetJid}`);
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                log('GETPP-ERR', err.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply('❌ *ᴄᴏᴜʟᴅ ɴᴏᴛ ꜰᴇᴛᴄʜ ᴘᴘ:* User has no profile picture or privacy is restricted.');
            }
        }
    },

    // 📱 2. QR
    {
        command: 'qr',
        aliases: ['qrcode', 'qrscan'],
        category: 'tools',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const rawQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quoted = unwrapAll(rawQuoted);
            const query = args.join(' ').trim();

            const isRepliedImage = Boolean(quoted?.imageMessage);
            const isImageUrl = /^https?:\/\/.+\.(png|jpe?g|webp|jfif|gif)(\?.*)?$/i.test(query) || /^https?:\/\/.+\/cdn\/.+/i.test(query);

            if (!query && !isRepliedImage) {
                return reply(
                    `⚠️ *ᴘʀᴏᴠɪᴅᴇ ᴛᴇxᴛ ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ǫʀ ɪᴍᴀɢᴇ!*\n` +
                    `_ɢᴇɴᴇʀᴀᴛᴇ: ${prefix}qr hello_\n` +
                    `_ꜱᴄᴀɴ: ${prefix}qr <image_url> (or reply to QR image)_`
                );
            }

            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
            let tempPath = null;

            try {
                if (isRepliedImage || isImageUrl) {
                    let scanUrl = query;

                    if (isRepliedImage) {
                        log('QR-SCAN', 'Downloading replied QR image...');
                        tempPath = await downloadToTemp(quoted.imageMessage, 'image', 'jpg');
                        const uploaded = await uploadMediaUrl(tempPath, `qr_${Date.now()}.jpg`);
                        scanUrl = uploaded.url;
                    }

                    log('QR-SCAN', `Scanning QR from: ${scanUrl}`);
                    const apiUrl = `https://kiraxmd-api.onrender.com/api/qr?action=generate&url=${encodeURIComponent(scanUrl)}`;
                    const data = await fetchWithRetry(apiUrl, 'QR-SCAN', 3);

                    if (!data.result?.text) throw new Error('No QR code detected in image.');

                    log('QR-SCAN-SUCCESS', `Decoded: ${data.result.text}`);
                    await sock.sendMessage(from, {
                        text: `╭━━〔 ǫʀ ꜱᴄᴀɴɴᴇʀ 〕━━╮\n┃\n┃  ${data.result.text}\n┃\n╰━━━━━━━━━━━━━━━━━╯\n\n${NORA_FOOTER}`
                    }, { quoted: msg });

                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                    return;
                }

                log('QR-GEN', `Generating QR for: ${query}`);
                const apiUrl = `https://kiraxmd-api.onrender.com/api/qr?action=generate&text=${encodeURIComponent(query)}`;
                const data = await fetchWithRetry(apiUrl, 'QR-GEN', 3);

                let imgPayload;
                if (data.result?.base64) {
                    const b64 = data.result.base64.replace(/^data:image\/\w+;base64,/, '');
                    imgPayload = Buffer.from(b64, 'base64');
                } else if (data.result?.image_url) {
                    imgPayload = { url: data.result.image_url };
                } else {
                    throw new Error('QR image data missing');
                }

                await sock.sendMessage(from, {
                    image: imgPayload,
                    caption: `*◈ ǫʀ ɢᴇɴᴇʀᴀᴛᴇᴅ*\n*ᴅᴀᴛᴀ:* ${query}\n\n${NORA_FOOTER}`
                }, { quoted: msg });

                log('QR-GEN-SUCCESS', 'QR sent successfully!');
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                log('QR-ERR', err.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ǫʀ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(tempPath);
            }
        }
    },

    // 🔗 3. TINYURL
    {
        command: 'tinyurl',
        aliases: ['tiny', 'short', 'shorten'],
        category: 'tools',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            let url = args[0]?.trim();

            if (!url) {
                const rawQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const qText = rawQuoted?.conversation || rawQuoted?.extendedTextMessage?.text || '';
                const match = qText.match(/https?:\/\/[^\s]+/);
                if (match) url = match[0];
            }

            if (!url) {
                return reply(`⚠️ *ᴘʀᴏᴠɪᴅᴇ ᴀ ᴜʀʟ ᴛᴏ ꜱʜᴏʀᴛᴇɴ!*\n_ᴇx: ${prefix}tinyurl https://youtube.com/..._`);
            }

            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

            log('TINYURL', `Shortening: ${url}`);
            await sock.sendMessage(from, { react: { text: '🔗', key: msg.key } });

            try {
                const apiUrl = `https://kiraxmd-api.onrender.com/api/tinyurl?url=${encodeURIComponent(url)}`;
                const data = await fetchWithRetry(apiUrl, 'TINYURL', 3);

                log('TINYURL-SUCCESS', `Short URL: ${data.result.short_url}`);
                await sock.sendMessage(from, {
                    text: `*🔗 ᴛɪɴʏᴜʀʟ ꜱʜᴏʀᴛᴇɴᴇʀ*\n\n*ꜱʜᴏʀᴛ ᴜʀʟ:* ${data.result.short_url}\n*ᴏʀɪɢɪɴᴀʟ:* ${data.result.original_url}\n\n${NORA_FOOTER}`
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                log('TINYURL-ERR', err.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ᴛɪɴʏᴜʀʟ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            }
        }
    },

    // 🌐 4. TRANSLATE
    {
        command: 'translate',
        aliases: ['tr', 'trt'],
        category: 'tools',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;

            if (!args.length || args[0].toLowerCase() === 'list' || args[0].toLowerCase() === 'langs') {
                const langLines = Object.entries(VALID_CODES)
                    .map(([code, name]) => `┃  ◈ \`${code}\` : ${name}`)
                    .join('\n');

                return reply(
                    `╭━━〔 ᴛʀᴀɴꜱʟᴀᴛᴇ ʟᴀɴɢᴜᴀɢᴇꜱ 〕━━╮\n` +
                    `${langLines}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `_ᴜꜱᴀɢᴇ: ${prefix}tr ml hello_\n` +
                    `_ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇꜱꜱᴀɢᴇ ᴡɪᴛʜ: ${prefix}tr ml_`
                );
            }

            const targetCode = resolveLangCode(args[0]);
            if (!targetCode) {
                return reply(`⚠️ *ɪɴᴠᴀʟɪᴅ ʟᴀɴɢᴜᴀɢᴇ ᴄᴏᴅᴇ!* ᴛʏᴘᴇ \`${prefix}tr list\` ᴛᴏ ꜱᴇᴇ ᴀᴠᴀɪʟᴀʙʟᴇ ʟᴀɴɢᴜᴀɢᴇꜱ.`);
            }

            let textToTranslate = args.slice(1).join(' ').trim();
            if (!textToTranslate) {
                const rawQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const q = unwrapAll(rawQuoted);
                textToTranslate = q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || '';
            }

            if (!textToTranslate) {
                return reply(`⚠️ *ᴘʀᴏᴠɪᴅᴇ ᴛᴇxᴛ ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇꜱꜱᴀɢᴇ!*\n_ᴇx: ${prefix}tr ${targetCode} hey tell about india_`);
            }

            log('TRANSLATE', `Translating to [${targetCode}]...`);
            await sock.sendMessage(from, { react: { text: '🌐', key: msg.key } });

            try {
                const apiUrl = `https://kiraxmd-api.onrender.com/api/translate?text=${encodeURIComponent(textToTranslate)}&to=${encodeURIComponent(targetCode)}`;
                const data = await fetchWithRetry(apiUrl, 'TRANSLATE', 3);

                const res = data.result;
                log('TRANSLATE-SUCCESS', `${res.from} -> ${res.to}`);

                await sock.sendMessage(from, {
                    text:
                        `*🌐 ᴛʀᴀɴꜱʟᴀᴛɪᴏɴ (${(res.from || 'auto').toUpperCase()} ➔ ${VALID_CODES[targetCode]})*\n\n` +
                        `${res.translated_text}\n\n${NORA_FOOTER}`
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                log('TRANSLATE-ERR', err.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ᴛʀᴀɴꜱʟᴀᴛᴇ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            }
        }
    },

    // ☁️ 5. URL
    {
        command: 'url',
        aliases: ['tourl', 'upload'],
        category: 'tools',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const rawQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const target = unwrapAll(rawQuoted) || unwrapAll(msg.message);

            let mediaMsg = null, mediaType = null, ext = 'bin', fileName = null;

            if (target?.imageMessage) {
                mediaMsg = target.imageMessage; mediaType = 'image'; ext = 'jpg';
            } else if (target?.videoMessage) {
                mediaMsg = target.videoMessage; mediaType = 'video'; ext = 'mp4';
            } else if (target?.audioMessage) {
                mediaMsg = target.audioMessage; mediaType = 'audio'; ext = target.audioMessage.ptt ? 'ogg' : 'mp3';
            } else if (target?.stickerMessage) {
                mediaMsg = target.stickerMessage; mediaType = 'sticker'; ext = 'webp';
            } else if (target?.documentMessage) {
                mediaMsg = target.documentMessage; mediaType = 'document';
                fileName = target.documentMessage.fileName || `file_${Date.now()}.bin`;
                ext = path.extname(fileName).replace('.', '') || 'bin';
            }

            if (!mediaMsg) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ɪᴍᴀɢᴇ, ᴠɪᴅᴇᴏ, ᴀᴜᴅɪᴏ, ꜱᴛɪᴄᴋᴇʀ, ᴏʀ ᴅᴏᴄᴜᴍᴇɴᴛ ᴡɪᴛʜ ${prefix}url*`);
            }

            log('URL-START', `Preparing ${mediaType} for upload...`);
            await sock.sendMessage(from, { react: { text: '☁️', key: msg.key } });

            let tempPath = null;
            try {
                tempPath = await downloadToTemp(mediaMsg, mediaType, ext);
                const finalName = fileName || `nora_${Date.now()}.${ext}`;
                const sizeMB = ((await fs.stat(tempPath)).size / (1024 * 1024)).toFixed(2);

                const uploaded = await uploadMediaUrl(tempPath, finalName);

                await sock.sendMessage(from, {
                    text:
                        `*☁️ ᴍᴇᴅɪᴀ ᴜᴘʟᴏᴀᴅᴇᴅ (${uploaded.host})*\n\n` +
                        `*ᴜʀʟ:* ${uploaded.url}\n` +
                        `*ꜱɪᴢᴇ:* ${sizeMB} ᴍʙ\n\n${NORA_FOOTER}`
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                log('URL-ERR', err.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ᴜᴘʟᴏᴀᴅ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(tempPath);
            }
        }
    },

    // 👁️ 6. VV
    {
        command: 'vv',
        aliases: ['viewonce', 'rvo', 'reveal'],
        category: 'tools',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const rawQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!rawQuoted) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴇᴡ-ᴏɴᴄᴇ ɪᴍᴀɢᴇ, ᴠɪᴅᴇᴏ, ᴏʀ ᴠᴏɪᴄᴇ ɴᴏᴛᴇ ᴡɪᴛʜ ${prefix}vv*`);
            }

            const base = unwrapBasic(rawQuoted);
            const voWrapper =
                base?.viewOnceMessage?.message ||
                base?.viewOnceMessageV2?.message ||
                base?.viewOnceMessageV2Extension?.message ||
                base;

            let mediaMsg = null, mediaType = null, ext = 'bin';

            if (voWrapper?.imageMessage && (base?.viewOnceMessage || base?.viewOnceMessageV2 || base?.viewOnceMessageV2Extension || voWrapper.imageMessage.viewOnce)) {
                mediaMsg = voWrapper.imageMessage; mediaType = 'image'; ext = 'jpg';
            } else if (voWrapper?.videoMessage && (base?.viewOnceMessage || base?.viewOnceMessageV2 || base?.viewOnceMessageV2Extension || voWrapper.videoMessage.viewOnce)) {
                mediaMsg = voWrapper.videoMessage; mediaType = 'video'; ext = 'mp4';
            } else if (voWrapper?.audioMessage && (base?.viewOnceMessage || base?.viewOnceMessageV2 || base?.viewOnceMessageV2Extension || voWrapper.audioMessage.viewOnce)) {
                mediaMsg = voWrapper.audioMessage; mediaType = 'audio'; ext = 'ogg';
            }

            if (!mediaMsg) {
                return reply('⚠️ *ᴛʜᴀᴛ ɪꜱ ɴᴏᴛ ᴀ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇꜱꜱᴀɢᴇ!*');
            }

            log('VV-START', `Revealing view-once ${mediaType}...`);
            await sock.sendMessage(from, { react: { text: '👁️', key: msg.key } });

            let tempPath = null;
            try {
                tempPath = await downloadToTemp(mediaMsg, mediaType, ext);
                const origCap = mediaMsg.caption ? `${mediaMsg.caption}\n\n${NORA_FOOTER}` : NORA_FOOTER;

                if (mediaType === 'image') {
                    await sock.sendMessage(from, { image: { url: tempPath }, caption: origCap }, { quoted: msg });
                } else if (mediaType === 'video') {
                    await sock.sendMessage(from, { video: { url: tempPath }, mimetype: 'video/mp4', caption: origCap }, { quoted: msg });
                } else if (mediaType === 'audio') {
                    await sock.sendMessage(from, {
                        audio: { url: tempPath },
                        mimetype: mediaMsg.mimetype || 'audio/ogg; codecs=opus',
                        ptt: Boolean(mediaMsg.ptt)
                    }, { quoted: msg });
                }

                log('VV-SUCCESS', `View-once ${mediaType} revealed!`);
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                log('VV-ERR', err.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ᴠᴠ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(tempPath);
            }
        }
    },

    // 📸 7. SS
    {
        command: 'ss',
        aliases: ['fullss', 'screenshot', 'ssweb'],
        category: 'tools',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            let url = args[0]?.trim();

            if (!url) {
                const rawQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const qText = rawQuoted?.conversation || rawQuoted?.extendedTextMessage?.text || '';
                const match = qText.match(/https?:\/\/[^\s]+/);
                if (match) url = match[0];
            }

            if (!url) {
                return reply(`⚠️ *ᴘʀᴏᴠɪᴅᴇ ᴀ ᴡᴇʙꜱɪᴛᴇ ᴜʀʟ!*\n_ᴇx: ${prefix}ss https://google.com_`);
            }

            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

            log('SS-START', `Capturing screenshot for: ${url}`);
            await sock.sendMessage(from, { react: { text: '📸', key: msg.key } });

            try {
                const apiUrl = `https://kiraxmd-api.onrender.com/api/fullss?url=${encodeURIComponent(url)}`;
                const data = await fetchWithRetry(apiUrl, 'SS', 3, 45000);

                log('SS-SUCCESS', `Screenshot URL: ${data.result.image_url}`);
                await sock.sendMessage(from, {
                    image: { url: data.result.image_url },
                    caption: `*📸 ᴡᴇʙ ꜱᴄʀᴇᴇɴꜱʜᴏᴛ*\n*ᴜʀʟ:* ${data.result.target_url || url}\n\n${NORA_FOOTER}`
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                log('SS-ERR', err.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜱᴄʀᴇᴇɴꜱʜᴏᴛ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            }
        }
    }
];