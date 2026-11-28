const fs = require('fs-extra');
const yt = require('../../lib/yt-engine');

const VIDEO_INLINE_LIMIT = 65 * 1024 * 1024;
const MENU_MARKER = 'ɴᴏʀᴀ ʏᴏᴜᴛᴜʙᴇ ᴏᴘᴛɪᴏɴꜱ';

async function sendDownloadedMedia(sock, from, msg, media, footerText = '') {
    if (!media || !media.path || !(await fs.pathExists(media.path))) {
        throw new Error('Media file was not generated.');
    }

    const { size } = await fs.stat(media.path);
    if (!size) throw new Error('Downloaded media file is empty.');

    if (media.ext === 'mp3' || media.mimetype === 'audio/mpeg') {
        await sock.sendMessage(
            from,
            {
                audio: { url: media.path },
                mimetype: 'audio/mpeg',
                ptt: false,
                fileName: `${media.title || 'audio'}.mp3`
            },
            { quoted: msg }
        );
        return;
    }

    const caption =
        `*◈ ɴᴏʀᴀ ʏᴏᴜᴛᴜʙᴇ*\n` +
        `*🎬 ${media.title || 'YouTube Video'}*\n` +
        `*⚡ ${media.quality || 'HD'} • ${yt.formatBytes(size)}*` +
        footerText;

    if (size > VIDEO_INLINE_LIMIT || media.playable === false) {
        await sock.sendMessage(
            from,
            {
                document: { url: media.path },
                mimetype: 'video/mp4',
                fileName: `${media.title || 'video'}.mp4`,
                caption
            },
            { quoted: msg }
        );
    } else {
        await sock.sendMessage(
            from,
            {
                video: { url: media.path },
                mimetype: 'video/mp4',
                caption
            },
            { quoted: msg }
        );
    }
}

function extractQuotedText(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    return (
        quoted?.conversation ||
        quoted?.extendedTextMessage?.text ||
        quoted?.imageMessage?.caption ||
        quoted?.videoMessage?.caption ||
        ''
    );
}

async function handleOptionReply(sock, msg, choiceText, footerText = '') {
    const from = msg.key.remoteJid;
    const quotedText = extractQuotedText(msg);
    if (!/^\d+$/.test(choiceText.trim()) || !quotedText.toLowerCase().includes(MENU_MARKER)) {
        return false;
    }

    const selectedNum = parseInt(choiceText.trim(), 10);
    const idMatch = quotedText.match(/\[([a-zA-Z0-9_-]{11})\]/);
    if (!idMatch) {
        await sock.sendMessage(from, { text: '❌ *Video ID not found in menu.*' }, { quoted: msg });
        return true;
    }

    const videoId = idMatch[1];
    await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });

    let media = null;
    try {
        media = await yt.downloadByOption(videoId, selectedNum);
        await sendDownloadedMedia(sock, from, msg, media, footerText);
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
    } catch (err) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}` }, { quoted: msg });
    } finally {
        await yt.cleanup(media?.path);
    }

    return true;
}

module.exports = [
    {
        command: 'ytv',
        aliases: ['video', 'ytmp4'],
        category: 'downloader',
        async before(sock, msg, { footerText }) {
            const body =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                '';
            return await handleOptionReply(sock, msg, body.trim(), footerText);
        },
        async execute(sock, msg, args, { reply, footerText, prefix }) {
            const from = msg.key.remoteJid;
            const rawInput = args.join(' ').trim();
            const quotedText = extractQuotedText(msg);

            // 1️⃣ Number Reply Handler (Reply 1, 2, 3... to Quality Menu)
            if (/^\d+$/.test(rawInput) && quotedText.toLowerCase().includes(MENU_MARKER)) {
                await handleOptionReply(sock, msg, rawInput, footerText);
                return;
            }

            // 2️⃣ Show All Available Qualities Menu or Direct Download if quality given
            let query = rawInput || yt.youtubeUrlFrom(quotedText) || '';
            if (!query) {
                return reply(
                    `⚠️ *Provide a YouTube URL or Video Name!*\n` +
                    `_Ex: ${prefix || '.'}ytv arz kiya_\n` +
                    `_Ex: ${prefix || '.'}ytv https://youtu.be/..._`
                );
            }

            const directQuality = query.match(/(?:^|\s)(\d{3,4}p)\s*$/i)?.[1]?.toLowerCase() || null;
            if (directQuality) query = query.replace(/(?:^|\s)\d{3,4}p\s*$/i, '').trim();

            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            let media = null;
            try {
                let url = yt.youtubeUrlFrom(query);
                if (!url) {
                    const results = await yt.searchYoutube(query, 1);
                    if (!results.length) throw new Error('No YouTube videos found.');
                    url = results[0].url;
                }

                // Direct download if user explicitly passed quality (e.g. .ytv arz kiya 720p)
                if (directQuality) {
                    await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });
                    media = await yt.downloadVideo(url, directQuality);
                    await sendDownloadedMedia(sock, from, msg, media, footerText);
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                    return;
                }

                // Show ALL available qualities menu (Option 1 = Highest Available Quality)
                const info = await yt.getVideoInfo(url);
                const menuList = Array.isArray(info.menu) && info.menu.length
                    ? info.menu
                    : info.options.map((opt, idx) => ({
                        number: idx + 1,
                        badge: `${idx + 1}.`,
                        type: opt.audio ? 'audio' : 'video',
                        label: opt.audio ? 'Audio Only' : (idx === 0 ? `${opt.quality.toUpperCase()} (BEST)` : opt.quality.toUpperCase()),
                        format: opt.audio ? 'MP3' : 'MP4',
                        sizeText: opt.size ? yt.formatBytes(opt.size) : 'N/A'
                    }));

                let menu = `*◈ ${MENU_MARKER}*\n\n`;
                menu += `*🎬 ${info.title}*\n`;
                menu += `⏱️ *${info.duration || 'N/A'}*\n`;
                menu += `[${info.videoId}]\n\n`;
                menuList.forEach((opt) => {
                    menu += `*${opt.number}.* ${opt.label} • ${opt.format} • _${opt.sizeText}_\n`;
                });
                menu += `\n_Reply with a number (1-${menuList.length}) to download_` + footerText;

                await sock.sendMessage(from, { text: menu }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await yt.cleanup(media?.path);
            }
        }
    },
    {
        command: 'yts',
        aliases: ['ytsearch'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, prefix }) {
            const query = args.join(' ').trim();
            if (!query) return reply(`⚠️ *Provide a search query!*\n_Ex: ${prefix || '.'}yts arz kiya_`);

            await sock.sendMessage(msg.key.remoteJid, { react: { text: '🔎', key: msg.key } });
            try {
                const results = await yt.searchYoutube(query, 5);
                if (!results.length) return reply('❌ *No results found.*');

                let text = `*◈ ʏᴏᴜᴛᴜʙᴇ ꜱᴇᴀʀᴄʜ*\n\n`;
                results.forEach((v, i) => {
                    text += `*${i + 1}. ${v.title}*\n⏱️ ${v.duration} • 👤 ${v.author}\n🔗 ${v.url}\n\n`;
                });
                await reply(text.trim());
            } catch (err) {
                reply(`❌ *Search failed:* ${err.message}`);
            }
        }
    }
];