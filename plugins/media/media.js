const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const NORA_FOOTER = '_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɴᴏʀᴀ_';

const log = (step, msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] [${step}] : ${msg}`);
};

// 📦 Unwrap Ephemeral, ViewOnce, and DocumentWithCaption
function unwrapMessage(m) {
    if (!m) return null;
    if (m.ephemeralMessage) return unwrapMessage(m.ephemeralMessage.message);
    if (m.viewOnceMessage) return unwrapMessage(m.viewOnceMessage.message);
    if (m.viewOnceMessageV2) return unwrapMessage(m.viewOnceMessageV2.message);
    if (m.viewOnceMessageV2Extension) return unwrapMessage(m.viewOnceMessageV2Extension.message);
    if (m.documentWithCaptionMessage) return unwrapMessage(m.documentWithCaptionMessage.message);
    return m;
}

// 🔍 Detect Media from Quoted or Current Message
function getMediaInfo(msg) {
    const rawQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = unwrapMessage(rawQuoted) || unwrapMessage(msg.message);
    if (!target) return null;

    if (target.videoMessage) {
        return { mediaMsg: target.videoMessage, mediaType: 'video', ext: 'mp4', kind: 'video', mimetype: target.videoMessage.mimetype || 'video/mp4', fileName: `Nova_Video_${Date.now()}.mp4` };
    }
    if (target.imageMessage) {
        return { mediaMsg: target.imageMessage, mediaType: 'image', ext: 'jpg', kind: 'image', mimetype: target.imageMessage.mimetype || 'image/jpeg', fileName: `Nova_Image_${Date.now()}.jpg` };
    }
    if (target.audioMessage) {
        return { mediaMsg: target.audioMessage, mediaType: 'audio', ext: target.audioMessage.ptt ? 'ogg' : 'mp3', kind: 'audio', mimetype: target.audioMessage.mimetype || 'audio/mpeg', fileName: `Nova_Audio_${Date.now()}.mp3` };
    }
    if (target.documentMessage) {
        const doc = target.documentMessage;
        const mime = (doc.mimetype || '').toLowerCase();
        const fName = doc.fileName || `Nova_Doc_${Date.now()}`;
        const ext = path.extname(fName).replace('.', '').toLowerCase() || (mime.includes('video') ? 'mp4' : mime.includes('audio') ? 'mp3' : mime.includes('image') ? 'jpg' : 'bin');
        let kind = 'document';
        if (mime.includes('video') || ['mp4', 'mkv', 'mov', 'avi', 'webm', '3gp'].includes(ext)) kind = 'video';
        else if (mime.includes('audio') || ['mp3', 'wav', 'm4a', 'ogg', 'opus', 'aac', 'flac'].includes(ext)) kind = 'audio';
        else if (mime.includes('image') || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) kind = 'image';
        return { mediaMsg: doc, mediaType: 'document', ext, kind, mimetype: doc.mimetype || 'application/octet-stream', fileName: fName };
    }
    return null;
}

// 🚀 Stream media directly to disk (Zero RAM spike)
async function downloadToTemp(mediaMsg, mediaType, ext) {
    const tempFile = path.join(os.tmpdir(), `nova_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`);
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

// ⏱️ Parse Time: Supports "0:01", "1:02:30", or raw seconds "120"
function parseTimeToSeconds(str) {
    if (!str) return NaN;
    const clean = str.trim();
    if (clean.includes(':')) {
        const parts = clean.split(':').map(Number);
        if (parts.some(isNaN)) return NaN;
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return NaN;
    }
    return parseFloat(clean);
}

// 🧹 Safe Temp Cleanup
async function cleanup(...files) {
    for (const f of files) {
        if (f && await fs.pathExists(f)) await fs.remove(f).catch(() => {});
    }
}

// 🎵 Shared Audio Effect Processor (bass, slow, speed, reverb)
async function processAudioEffect(sock, msg, { reply, prefix }, cmdName, filterStr, reactEmoji = '🎵') {
    const from = msg.key.remoteJid;
    const info = getMediaInfo(msg);

    if (!info || (info.kind !== 'audio' && info.kind !== 'video')) {
        return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ᴀᴜᴅɪᴏ, ᴠᴏɪᴄᴇ ɴᴏᴛᴇ, ᴏʀ ᴠɪᴅᴇᴏ ᴡɪᴛʜ ${prefix}${cmdName}*`);
    }

    log(cmdName.toUpperCase(), `Applying audio filter...`);
    await sock.sendMessage(from, { react: { text: reactEmoji, key: msg.key } });

    let inputPath = null;
    const outputPath = path.join(os.tmpdir(), `nova_${cmdName}_${Date.now()}.mp3`);

    try {
        inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .noVideo()
                .audioFilters(filterStr)
                .audioCodec('libmp3lame')
                .audioBitrate('192k')
                .format('mp3')
                .on('end', resolve)
                .on('error', (err) => reject(new Error(err.message)))
                .save(outputPath);
        });

        await sock.sendMessage(from, {
            audio: { url: outputPath },
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `Nova_${cmdName}_${Date.now()}.mp3`
        }, { quoted: msg });

        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
    } catch (err) {
        log(`${cmdName.toUpperCase()}-ERR`, err.message);
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
        reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
    } finally {
        await cleanup(inputPath, outputPath);
    }
}

module.exports = [
    // ==========================================
    // 🎵 1. MP3 (Universal Audio Extractor)
    // ==========================================
    {
        command: 'mp3',
        aliases: ['tomp3', 'toaudio', 'audio'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);

            if (!info || (info.kind !== 'video' && info.kind !== 'audio')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ, ᴠᴏɪᴄᴇ ɴᴏᴛᴇ, ᴀᴜᴅɪᴏ, ᴏʀ ᴍᴇᴅɪᴀ ᴅᴏᴄᴜᴍᴇɴᴛ ᴡɪᴛʜ ${prefix}mp3*`);
            }

            await sock.sendMessage(from, { react: { text: '🎵', key: msg.key } });
            let inputPath = null;
            const outputPath = path.join(os.tmpdir(), `nova_mp3_${Date.now()}.mp3`);
            const outName = `${path.parse(info.fileName).name}.mp3`;

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .noVideo()
                        .audioCodec('libmp3lame')
                        .audioBitrate('192k')
                        .audioFrequency(44100)
                        .format('mp3')
                        .on('end', resolve)
                        .on('error', reject)
                        .save(outputPath);
                });

                await sock.sendMessage(from, {
                    audio: { url: outputPath },
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: outName
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // 🔊 2. BASS (Audio Bass Boost)
    // ==========================================
    {
        command: 'bass',
        aliases: ['bassboost'],
        category: 'media',
        async execute(sock, msg, args, ctx) {
            const gain = Math.min(Math.max(parseInt(args[0]) || 15, 5), 25);
            await processAudioEffect(sock, msg, ctx, 'bass', `bass=g=${gain}:f=110:w=0.6`, '🔊');
        }
    },

    // ==========================================
    // 🐢 3. SLOW (Audio Slowed Down)
    // ==========================================
    {
        command: 'slow',
        aliases: ['slowed'],
        category: 'media',
        async execute(sock, msg, args, ctx) {
            await processAudioEffect(sock, msg, ctx, 'slow', 'asetrate=44100*0.85,aresample=44100', '🐢');
        }
    },

    // ==========================================
    // ⚡ 4. SPEED (Audio Sped Up)
    // ==========================================
    {
        command: 'speed',
        aliases: ['fast', 'nightcore'],
        category: 'media',
        async execute(sock, msg, args, ctx) {
            const spd = parseFloat(args[0]) || 1.35;
            const safeSpd = Math.min(Math.max(spd, 0.5), 2.0);
            await processAudioEffect(sock, msg, ctx, 'speed', `atempo=${safeSpd}`, '⚡');
        }
    },

    // ==========================================
    // 🌌 5. REVERB (Audio Reverb / Slowed Echo)
    // ==========================================
    {
        command: 'reverb',
        aliases: ['echo'],
        category: 'media',
        async execute(sock, msg, args, ctx) {
            await processAudioEffect(sock, msg, ctx, 'reverb', 'aecho=0.8:0.88:60|120:0.4|0.3', '🌌');
        }
    },

    // ==========================================
    // 🌊 6. WAVE (Audio to Waveform Video)
    // ==========================================
    {
        command: 'wave',
        aliases: ['waveform'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || (info.kind !== 'audio' && info.kind !== 'video')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ᴀᴜᴅɪᴏ ᴏʀ ᴠᴏɪᴄᴇ ɴᴏᴛᴇ ᴡɪᴛʜ ${prefix}wave*`);
            }

            await sock.sendMessage(from, { react: { text: '🌊', key: msg.key } });
            let inputPath = null;
            const outputPath = path.join(os.tmpdir(), `nova_wave_${Date.now()}.mp4`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .complexFilter('[0:a]showwaves=s=640x360:mode=cline:colors=cyan|white:rate=25[v]')
                        .outputOptions(['-map [v]', '-map 0:a', '-c:v libx264', '-preset ultrafast', '-pix_fmt yuv420p', '-c:a aac', '-b:a 128k', '-shortest'])
                        .on('end', resolve)
                        .on('error', reject)
                        .save(outputPath);
                });

                await sock.sendMessage(from, {
                    video: { url: outputPath },
                    mimetype: 'video/mp4',
                    caption: NORA_FOOTER
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // ⬛ 7. BLACK (Audio to Black Screen Video)
    // ==========================================
    {
        command: 'black',
        aliases: ['blackscreen'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || (info.kind !== 'audio' && info.kind !== 'video')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ᴀᴜᴅɪᴏ ᴏʀ ᴠᴏɪᴄᴇ ɴᴏᴛᴇ ᴡɪᴛʜ ${prefix}black*`);
            }

            await sock.sendMessage(from, { react: { text: '⬛', key: msg.key } });
            let inputPath = null;
            const outputPath = path.join(os.tmpdir(), `nova_black_${Date.now()}.mp4`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                await new Promise((resolve, reject) => {
                    ffmpeg()
                        .input('color=c=black:s=640x360:r=1')
                        .inputFormat('lavfi')
                        .input(inputPath)
                        .outputOptions(['-map 0:v', '-map 1:a', '-c:v libx264', '-preset ultrafast', '-tune stillimage', '-pix_fmt yuv420p', '-c:a aac', '-b:a 128k', '-shortest'])
                        .on('end', resolve)
                        .on('error', reject)
                        .save(outputPath);
                });

                await sock.sendMessage(from, {
                    video: { url: outputPath },
                    mimetype: 'video/mp4',
                    caption: NORA_FOOTER
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // ⭕ 8. CIRCLE (Crop Image into a Circle PNG)
    // ==========================================
    {
        command: 'circle',
        aliases: ['roundimg', 'circleimg'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || info.kind !== 'image') {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ɪᴍᴀɢᴇ ᴡɪᴛʜ ${prefix}circle*`);
            }

            await sock.sendMessage(from, { react: { text: '⭕', key: msg.key } });
            let inputPath = null;
            const outputPath = path.join(os.tmpdir(), `nova_circle_${Date.now()}.png`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                const img = sharp(inputPath);
                const meta = await img.metadata();
                const size = Math.min(meta.width, meta.height);

                const circleMask = Buffer.from(
                    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" /></svg>`
                );

                await img
                    .resize(size, size, { fit: 'cover' })
                    .composite([{ input: circleMask, blend: 'dest-in' }])
                    .png()
                    .toFile(outputPath);

                await sock.sendMessage(from, {
                    image: { url: outputPath },
                    mimetype: 'image/png',
                    caption: NORA_FOOTER
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // 🎥 9. PTV (Video to WhatsApp Round Video Note)
    // ==========================================
    {
        command: 'ptv',
        aliases: ['round', 'videonote'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || info.kind !== 'video') {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ ᴡɪᴛʜ ${prefix}ptv*`);
            }

            await sock.sendMessage(from, { react: { text: '🎥', key: msg.key } });
            let inputPath = null;
            const outputPath = path.join(os.tmpdir(), `nova_ptv_${Date.now()}.mp4`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .videoFilters(["crop='min(iw,ih)':'min(iw,ih)'", 'scale=480:480'])
                        .outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p', '-c:a aac', '-b:a 128k'])
                        .on('end', resolve)
                        .on('error', reject)
                        .save(outputPath);
                });

                await sock.sendMessage(from, {
                    video: { url: outputPath },
                    mimetype: 'video/mp4',
                    ptv: true,
                    caption: NORA_FOOTER
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // 📦 10. COMPRESS (Reduce Video File Size)
    // ==========================================
    {
        command: 'compress',
        aliases: ['comp'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || info.kind !== 'video') {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ ᴡɪᴛʜ ${prefix}compress*`);
            }

            await sock.sendMessage(from, { react: { text: '📦', key: msg.key } });
            let inputPath = null;
            const outputPath = path.join(os.tmpdir(), `nova_comp_${Date.now()}.mp4`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                const oldSize = (await fs.stat(inputPath)).size / (1024 * 1024);

                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .outputOptions(['-c:v libx264', '-crf 30', '-preset veryfast', '-pix_fmt yuv420p', '-c:a aac', '-b:a 96k'])
                        .on('end', resolve)
                        .on('error', reject)
                        .save(outputPath);
                });

                const newSize = (await fs.stat(outputPath)).size / (1024 * 1024);

                await sock.sendMessage(from, {
                    video: { url: outputPath },
                    mimetype: 'video/mp4',
                    caption: `*📦 ᴄᴏᴍᴘʀᴇꜱꜱᴇᴅ:* ${oldSize.toFixed(1)}ᴍʙ ➔ ${newSize.toFixed(1)}ᴍʙ\n\n${NORA_FOOTER}`
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // 📄 11. DOC (Convert Any Media to Document)
    // ==========================================
    {
        command: 'doc',
        aliases: ['todoc', 'document'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ, ɪᴍᴀɢᴇ, ᴏʀ ᴀᴜᴅɪᴏ ᴡɪᴛʜ ${prefix}doc [filename]*`);
            }

            await sock.sendMessage(from, { react: { text: '📄', key: msg.key } });
            let inputPath = null;

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                const customName = args.join(' ').trim();
                const finalName = customName ? (customName.includes('.') ? customName : `${customName}.${info.ext}`) : info.fileName;

                await sock.sendMessage(from, {
                    document: { url: inputPath },
                    mimetype: info.mimetype,
                    fileName: finalName,
                    caption: NORA_FOOTER
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath);
            }
        }
    },

    // ==========================================
    // 🔄 12. FLIP (right, left, top, bottom)
    // ==========================================
    {
        command: 'flip',
        aliases: ['mirror'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || (info.kind !== 'video' && info.kind !== 'image')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ ᴏʀ ɪᴍᴀɢᴇ!*\n_ᴇx: ${prefix}flip left | right | top | bottom_`);
            }

            const dir = (args[0] || 'left').toLowerCase();
            let filter = 'hflip';

            if (['top', 'bottom', 'up', 'down', 'v', 'vertical'].includes(dir)) {
                filter = 'vflip';
            } else if (['left', 'right', 'h', 'horizontal'].includes(dir)) {
                filter = 'hflip';
            } else {
                return reply(`⚠️ *ɪɴᴠᴀʟɪᴅ ᴅɪʀᴇᴄᴛɪᴏɴ!* ᴜꜱᴇ: \`left\`, \`right\`, \`top\`, or \`bottom\``);
            }

            await sock.sendMessage(from, { react: { text: '🔄', key: msg.key } });

            let inputPath = null;
            const outExt = info.kind === 'image' ? 'jpg' : 'mp4';
            const outputPath = path.join(os.tmpdir(), `nova_flip_${Date.now()}.${outExt}`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                await new Promise((resolve, reject) => {
                    const ff = ffmpeg(inputPath).videoFilters(filter);
                    if (info.kind === 'video') ff.outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p', '-c:a copy']);
                    ff.on('end', resolve).on('error', reject).save(outputPath);
                });

                if (info.kind === 'image') {
                    await sock.sendMessage(from, { image: { url: outputPath }, caption: NORA_FOOTER }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { video: { url: outputPath }, mimetype: 'video/mp4', caption: NORA_FOOTER }, { quoted: msg });
                }

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // 📝 13. CAPTION (Add/Edit Media Caption)
    // ==========================================
    {
        command: 'caption',
        aliases: ['cap', 'setcaption'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            const newCap = args.join(' ').trim();

            if (!info || info.kind === 'audio') {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ, ɪᴍᴀɢᴇ, ᴏʀ ᴅᴏᴄᴜᴍᴇɴᴛ ᴡɪᴛʜ ${prefix}caption <text>*`);
            }
            if (!newCap) return reply(`⚠️ *ᴘʀᴏᴠɪᴅᴇ ᴀ ᴄᴀᴘᴛɪᴏɴ ᴛᴇxᴛ!*`);

            await sock.sendMessage(from, { react: { text: '📝', key: msg.key } });
            let inputPath = null;

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                const fullCaption = `${newCap}\n\n${NORA_FOOTER}`;

                if (info.mediaType === 'image') {
                    await sock.sendMessage(from, { image: { url: inputPath }, caption: fullCaption }, { quoted: msg });
                } else if (info.mediaType === 'video') {
                    await sock.sendMessage(from, { video: { url: inputPath }, mimetype: 'video/mp4', caption: fullCaption }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { document: { url: inputPath }, mimetype: info.mimetype, fileName: info.fileName, caption: fullCaption }, { quoted: msg });
                }

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath);
            }
        }
    },

    // ==========================================
    // 📐 14. RESIZE (720 | 1280x720 | 9:16 | 16:9)
    // ==========================================
    {
        command: 'resize',
        aliases: ['scale', 'ratio'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || (info.kind !== 'video' && info.kind !== 'image')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ ᴏʀ ɪᴍᴀɢᴇ!*\n_ᴇx: ${prefix}resize 720 | ${prefix}resize 1280x720 | ${prefix}resize 9:16_`);
            }

            const dim = args[0]?.toLowerCase();
            if (!dim) {
                return reply(`⚠️ *ᴘʀᴏᴠɪᴅᴇ ꜱɪᴢᴇ ᴏʀ ʀᴀᴛɪᴏ!*\n_ᴇx: ${prefix}resize 720 | ${prefix}resize 1280x720 | ${prefix}resize 9:16_`);
            }

            let vfFilter = '';
            if (dim.includes(':')) {
                // Aspect ratio crop (e.g., 9:16, 16:9, 4:5, 1:1) without stretching
                const [rw, rh] = dim.split(':').map(Number);
                if (isNaN(rw) || isNaN(rh) || rw <= 0 || rh <= 0) return reply('⚠️ *ɪɴᴠᴀʟɪᴅ ᴀꜱᴘᴇᴄᴛ ʀᴀᴛɪᴏ!*');
                vfFilter = `crop='if(gt(a,${rw}/${rh}),ih*${rw}/${rh},iw)':'if(gt(a,${rw}/${rh}),ih,iw*${rh}/${rw})',scale=trunc(iw/2)*2:trunc(ih/2)*2`;
            } else if (dim.includes('x')) {
                const [w, h] = dim.split('x').map(Number);
                if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return reply('⚠️ *ɪɴᴠᴀʟɪᴅ ᴅɪᴍᴇɴꜱɪᴏɴꜱ!*');
                vfFilter = `scale=${w - (w % 2)}:${h - (h % 2)}`;
            } else {
                const w = parseInt(dim);
                if (isNaN(w) || w <= 0) return reply('⚠️ *ɪɴᴠᴀʟɪᴅ ᴡɪᴅᴛʜ!*');
                vfFilter = `scale=${w - (w % 2)}:-2`;
            }

            await sock.sendMessage(from, { react: { text: '📐', key: msg.key } });
            let inputPath = null;
            const outExt = info.kind === 'image' ? 'jpg' : 'mp4';
            const outputPath = path.join(os.tmpdir(), `nova_resize_${Date.now()}.${outExt}`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                await new Promise((resolve, reject) => {
                    const ff = ffmpeg(inputPath).videoFilters(vfFilter);
                    if (info.kind === 'video') ff.outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p', '-c:a copy']);
                    ff.on('end', resolve).on('error', reject).save(outputPath);
                });

                if (info.kind === 'image') {
                    await sock.sendMessage(from, { image: { url: outputPath }, caption: NORA_FOOTER }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { video: { url: outputPath }, mimetype: 'video/mp4', caption: NORA_FOOTER }, { quoted: msg });
                }

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // 🎞️ 15. SLOWMO (Video Slow Motion)
    // ==========================================
    {
        command: 'slowmo',
        aliases: ['slomo'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || info.kind !== 'video') {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ ᴡɪᴛʜ ${prefix}slowmo*`);
            }

            await sock.sendMessage(from, { react: { text: '🎞️', key: msg.key } });
            let inputPath = null;
            const outputPath = path.join(os.tmpdir(), `nova_slowmo_${Date.now()}.mp4`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                await new Promise((resolve, reject) => {
                    ffmpeg(inputPath)
                        .videoFilters('setpts=2.0*PTS')
                        .audioFilters('atempo=0.5')
                        .outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p', '-c:a aac'])
                        .on('end', resolve)
                        .on('error', () => {
                            // Fallback if video has no audio track
                            ffmpeg(inputPath)
                                .videoFilters('setpts=2.0*PTS')
                                .noAudio()
                                .outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p'])
                                .on('end', resolve)
                                .on('error', reject)
                                .save(outputPath);
                        })
                        .save(outputPath);
                });

                await sock.sendMessage(from, {
                    video: { url: outputPath },
                    mimetype: 'video/mp4',
                    caption: NORA_FOOTER
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // 🔲 16. SQUARE (1:1 Crop Video / Image)
    // ==========================================
    {
        command: 'square',
        aliases: ['sq'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || (info.kind !== 'video' && info.kind !== 'image')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ ᴏʀ ɪᴍᴀɢᴇ ᴡɪᴛʜ ${prefix}square*`);
            }

            await sock.sendMessage(from, { react: { text: '🔲', key: msg.key } });
            let inputPath = null;
            const outExt = info.kind === 'image' ? 'jpg' : 'mp4';
            const outputPath = path.join(os.tmpdir(), `nova_sq_${Date.now()}.${outExt}`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                await new Promise((resolve, reject) => {
                    const ff = ffmpeg(inputPath).videoFilters("crop='min(iw,ih)':'min(iw,ih)'");
                    if (info.kind === 'video') ff.outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p', '-c:a copy']);
                    ff.on('end', resolve).on('error', reject).save(outputPath);
                });

                if (info.kind === 'image') {
                    await sock.sendMessage(from, { image: { url: outputPath }, caption: NORA_FOOTER }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, { video: { url: outputPath }, mimetype: 'video/mp4', caption: NORA_FOOTER }, { quoted: msg });
                }

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    },

    // ==========================================
    // ✂️ 17. TRIM (Video & Audio Trimmer)
    // Supports: .trim 0:01,2:00  OR  .trim 1,120
    // ==========================================
    {
        command: 'trim',
        aliases: ['cut'],
        category: 'media',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMediaInfo(msg);
            if (!info || (info.kind !== 'video' && info.kind !== 'audio')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ ᴏʀ ᴀᴜᴅɪᴏ!*\n_ᴇx: ${prefix}trim 0:01,2:00  ᴏʀ  ${prefix}trim 1,120_`);
            }

            const rawInput = args.join(' ').trim();
            const parts = rawInput.includes(',') ? rawInput.split(',') : rawInput.split(/\s+/);

            if (parts.length < 2) {
                return reply(`⚠️ *ɪɴᴠᴀʟɪᴅ ꜰᴏʀᴍᴀᴛ!*\n_ᴇx: ${prefix}trim 0:05,0:30  ᴏʀ  ${prefix}trim 5,30_`);
            }

            const startSec = parseTimeToSeconds(parts[0]);
            const endSec = parseTimeToSeconds(parts[1]);

            if (isNaN(startSec) || isNaN(endSec) || endSec <= startSec) {
                return reply(`⚠️ *ɪɴᴠᴀʟɪᴅ ᴛɪᴍᴇ ʀᴀɴɢᴇ!* ᴇɴᴅ ᴛɪᴍᴇ ᴍᴜꜱᴛ ʙᴇ ɢʀᴇᴀᴛᴇʀ ᴛʜᴀɴ ꜱᴛᴀʀᴛ ᴛɪᴍᴇ.`);
            }

            const duration = endSec - startSec;
            await sock.sendMessage(from, { react: { text: '✂️', key: msg.key } });

            let inputPath = null;
            const outExt = info.kind === 'audio' ? 'mp3' : 'mp4';
            const outputPath = path.join(os.tmpdir(), `nova_trim_${Date.now()}.${outExt}`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);

                await new Promise((resolve, reject) => {
                    const ff = ffmpeg(inputPath).setStartTime(startSec).setDuration(duration);
                    if (info.kind === 'audio') {
                        ff.noVideo().audioCodec('libmp3lame').audioBitrate('192k').format('mp3');
                    } else {
                        ff.outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p', '-c:a aac']);
                    }
                    ff.on('end', resolve).on('error', reject).save(outputPath);
                });

                if (info.kind === 'audio') {
                    await sock.sendMessage(from, {
                        audio: { url: outputPath },
                        mimetype: 'audio/mpeg',
                        ptt: false,
                        fileName: `Nova_Trim_${Date.now()}.mp3`
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(from, {
                        video: { url: outputPath },
                        mimetype: 'video/mp4',
                        caption: NORA_FOOTER
                    }, { quoted: msg });
                }

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outputPath);
            }
        }
    }
];