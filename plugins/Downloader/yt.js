const fs = require('fs-extra');
const yt = require('../../lib/yt-engine');

const VIDEO_INLINE_LIMIT = 65 * 1024 * 1024;

module.exports = [
    {
        command: 'ytv',
        aliases: ['video', 'ytmp4'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, footerText, prefix }) {
            const from = msg.key.remoteJid;
            const rawInput = args.join(' ').trim();
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || '';

            // 1️⃣ Number Reply Handler (Reply 1, 2, 3... to Quality Menu)
            if (/^\d+$/.test(rawInput) && quotedText.includes('ɴᴏʀᴀ ʏᴏᴜᴛᴜʙᴇ ᴏᴘᴛɪᴏɴꜱ')) {
                const selectedNum = parseInt(rawInput, 10);
                const idMatch = quotedText.match(/\[([a-zA-Z0-9_-]{11})\]/);
                if (!idMatch) return reply('❌ *Video ID not found in menu.*');

                const videoId = idMatch[1];
                const optionLines = quotedText.split('\n').filter((l) => /^\*\d+\.\*/.test(l.trim()));
                const pickedLine = optionLines[selectedNum - 1];
                if (!pickedLine) return reply('⚠️ *Invalid option number!*');

                await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });
                let filePath = null;

                try {
                    if (/audio/i.test(pickedLine)) {
                        const aud = await yt.downloadAudio(videoId);
                        filePath = aud.path;
                        await sock.sendMessage(from, {
                            audio: { url: filePath },
                            mimetype: aud.mimetype,
                            ptt: false,
                            fileName: `${aud.title}.${aud.ext}`
                        }, { quoted: msg });
                    } else {
                        const quality = pickedLine.match(/(\d{3,4}p)/i)?.[1] || '360p';
                        const vid = await yt.downloadVideo(videoId, quality);
                        filePath = vid.path;

                        const { size } = await fs.stat(filePath);
                        const caption = `*◈ ɴᴏʀᴀ ʏᴏᴜᴛᴜʙᴇ*\n*🎬 ${vid.title}*\n*⚡ ${vid.quality} • ${yt.formatBytes(size)}*` + footerText;

                        if (size > VIDEO_INLINE_LIMIT || !vid.playable) {
                            await sock.sendMessage(from, {
                                document: { url: filePath },
                                mimetype: 'video/mp4',
                                fileName: `${vid.title}.mp4`,
                                caption
                            }, { quoted: msg });
                        } else {
                            await sock.sendMessage(from, {
                                video: { url: filePath },
                                mimetype: 'video/mp4',
                                caption
                            }, { quoted: msg });
                        }
                    }
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                    reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
                } finally {
                    await yt.cleanup(filePath);
                }
                return;
            }

            // 2️⃣ Show All Available Qualities Menu or Direct Download if quality given
            let query = rawInput || quotedText;
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

            let filePath = null;
            try {
                let url = yt.youtubeUrlFrom(query);
                if (!url) {
                    const results = await yt.searchYoutube(query, 1);
                    if (!results.length) throw new Error('No YouTube videos found.');
                    url = results[0].url;
                }

                // Direct download if user explicitly passed quality (e.g. .ytv arz kiya 360p)
                if (directQuality) {
                    await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });
                    const vid = await yt.downloadVideo(url, directQuality);
                    filePath = vid.path;

                    const { size } = await fs.stat(filePath);
                    const caption = `*◈ ɴᴏʀᴀ ʏᴏᴜᴛᴜʙᴇ*\n*🎬 ${vid.title}*\n*⚡ ${vid.quality} • ${yt.formatBytes(size)}*` + footerText;

                    if (size > VIDEO_INLINE_LIMIT || !vid.playable) {
                        await sock.sendMessage(from, {
                            document: { url: filePath },
                            mimetype: 'video/mp4',
                            fileName: `${vid.title}.mp4`,
                            caption
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, {
                            video: { url: filePath },
                            mimetype: 'video/mp4',
                            caption
                        }, { quoted: msg });
                    }
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                    return;
                }

                // Show ALL available qualities menu
                const info = await yt.getVideoInfo(url);
                let menu = `*◈ ɴᴏʀᴀ ʏᴏᴜᴛᴜʙᴇ ᴏᴘᴛɪᴏɴꜱ*\n\n`;
                menu += `*🎬 ${info.title}*\n`;
                menu += `[${info.videoId}]\n\n`;
                info.options.forEach((opt, i) => {
                    const label = opt.audio ? 'Audio Only' : opt.quality;
                    const sizeStr = opt.size ? ` ~ _${yt.formatBytes(opt.size)}_` : '';
                    menu += `*${i + 1}.* ${label}${sizeStr}\n`;
                });
                menu += `\n_Reply with a number (1-${info.options.length}) to download_` + footerText;

                await sock.sendMessage(from, { text: menu }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await yt.cleanup(filePath);
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