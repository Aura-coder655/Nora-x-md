const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const protobuf = require('protobufjs');
const {
    downloadContentFromMessage,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    proto
} = require('@whiskeysockets/baileys');

const NORA_FOOTER = '_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɴᴏʀᴀ_';
const CONFIG_PATH = path.join(__dirname, '../../sticker_config.json');

// ==========================================
// 🔧 SOUND STICKER PROTOBUF PATCH (Field 24/25/26 + Wrapper 134)
// ==========================================
let soundProtoInstalled = false;

function installSoundStickerProto(WAProto) {
    if (soundProtoInstalled || !WAProto?.Message?.FutureProofMessage) return;
    soundProtoInstalled = true;

    const { Reader } = protobuf;
    const { Message, ContextInfo } = WAProto;
    const { StickerMessage, AudioMessage, FutureProofMessage } = Message;

    function decodeTracked(original, r, l, e) {
        if (r && typeof r.pos === 'number' && r.buf) {
            const start = r.pos;
            const msg = original(r, l, e);
            return [msg, r.buf.subarray(start, r.pos)];
        }
        return [original(r, l, e), r];
    }

    function eachField(bytes, wanted, onField) {
        if (!bytes?.length) return;
        const reader = Reader.create(bytes);
        try {
            while (reader.pos < reader.len) {
                const tag = reader.uint32();
                const no = tag >>> 3;
                const wireType = tag & 7;
                if (!wanted.has(no)) reader.skipType(wireType);
                else if (wireType === 2) onField(no, reader.bytes());
                else if (wireType === 0) {
                    const v = reader.int64();
                    onField(no, typeof v === 'object' ? Number(v.toString()) : v);
                } else reader.skipType(wireType);
            }
        } catch {}
    }

    function cloneWithout(m, keys) {
        const copy = Object.assign(Object.create(Object.getPrototypeOf(m)), m);
        for (const key of keys) delete copy[key];
        return copy;
    }

    // Patch StickerMessage: 24=premium, 25=emojis, 26=audioMessage
    const stkFields = [
        { no: 24, name: 'premium', kind: 'int32' },
        { no: 25, name: 'emojis', kind: 'string' },
        { no: 26, name: 'audioMessage', kind: AudioMessage }
    ];
    const stkByNo = new Map(stkFields.map((f) => [f.no, f]));
    const stkWanted = new Set(stkByNo.keys());

    const origStkDecode = StickerMessage.decode;
    StickerMessage.decode = function (r, l, e) {
        const [m, bytes] = decodeTracked(origStkDecode, r, l, e);
        eachField(bytes, stkWanted, (no, value) => {
            const f = stkByNo.get(no);
            if (f.kind === 'string') m[f.name] = Buffer.from(value).toString('utf8');
            else if (typeof f.kind === 'string') m[f.name] = value;
            else m[f.name] = f.kind.decode(value);
        });
        return m;
    };

    const origStkEncode = StickerMessage.encode;
    StickerMessage.encode = function (m, w) {
        w = origStkEncode(m, w);
        for (const f of stkFields) {
            const v = m[f.name];
            if (v == null) continue;
            if (f.kind === 'string') w.uint32((f.no << 3) | 2).string(v);
            else if (typeof f.kind === 'string') w.uint32(f.no << 3)[f.kind](v);
            else f.kind.encode(v, w.uint32((f.no << 3) | 2).fork()).ldelim();
        }
        return w;
    };

    const origStkFromObj = StickerMessage.fromObject;
    StickerMessage.fromObject = function (d) {
        const m = origStkFromObj(d);
        if (m === d || !d) return m;
        for (const f of stkFields) {
            const v = d[f.name];
            if (v != null) m[f.name] = typeof f.kind === 'string' ? v : f.kind.fromObject(v);
        }
        return m;
    };

    // Patch Message: Wrapper 134 (audioStickerMessage -> FutureProofMessage)
    const AUDIO_STICKER_NO = 134;
    const msgWanted = new Set([AUDIO_STICKER_NO]);

    const origMsgDecode = Message.decode;
    Message.decode = function (r, l, e) {
        const [msg, bytes] = decodeTracked(origMsgDecode, r, l, e);
        eachField(bytes, msgWanted, (no, value) => {
            if (no === AUDIO_STICKER_NO) {
                const inner = FutureProofMessage.decode(value).message;
                for (const key of Object.keys(inner || {})) {
                    if (msg[key] == null) msg[key] = inner[key];
                }
            }
        });
        return msg;
    };

    const origMsgEncode = Message.encode;
    Message.encode = function (m, w) {
        if (!m?.stickerMessage?.audioMessage) return origMsgEncode(m, w);
        w = origMsgEncode(cloneWithout(m, ['stickerMessage']), w);
        w.uint32((AUDIO_STICKER_NO << 3) | 2).fork();
        w.uint32((1 << 3) | 2).fork();
        origMsgEncode({ stickerMessage: m.stickerMessage }, w).ldelim();
        return w.ldelim();
    };

    // Patch ContextInfo so quoting an audio sticker doesn't break
    const origCtxEncode = ContextInfo.encode;
    ContextInfo.encode = function (m, w) {
        const quoted = m?.quotedMessage;
        if (!quoted?.stickerMessage?.audioMessage) return origCtxEncode(m, w);
        const plainQuoted = {
            ...quoted,
            stickerMessage: cloneWithout(quoted.stickerMessage, ['emojis', 'audioMessage'])
        };
        return origCtxEncode({ ...m, quotedMessage: plainQuoted }, w);
    };
}

installSoundStickerProto(proto);

// ==========================================
// 💾 PERSISTENT PACKNAME CONFIG (Changeable from WhatsApp)
// ==========================================
function getStickerConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return fs.readJSONSync(CONFIG_PATH);
        }
    } catch {}
    const defaults = { packname: 'ɴᴏʀᴀ ʙᴏᴛ', author: 'auto' };
    fs.writeJSONSync(CONFIG_PATH, defaults, { spaces: 2 });
    return defaults;
}

function saveStickerConfig(packname, author = 'auto') {
    fs.writeJSONSync(CONFIG_PATH, { packname, author }, { spaces: 2 });
}

function getExactRawArgs(msg) {
    const raw =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.ephemeralMessage?.message?.conversation ||
        msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
        '';
    const match = raw.match(/^\S+?(?: |\n)([\s\S]*)$/);
    return match ? match[1] : '';
}

function splitPackAndAuthor(exactText) {
    if (exactText.includes('|')) {
        const idx = exactText.indexOf('|');
        const top = exactText.slice(0, idx);
        const bottom = exactText.slice(idx + 1);
        return {
            packname: top.replace(/ $/, ''),
            author: bottom.replace(/^ /, '')
        };
    }
    return { packname: exactText, author: '' };
}

// ==========================================
// 🏷️ PURE-NODE WEBP EXIF INJECTOR (White • Grey Support)
// ==========================================
function buildExifPayload(packname, author) {
    const json = {
        'sticker-pack-id': 'com.nova.nora.sticker',
        'sticker-pack-name': packname || '',
        'sticker-pack-publisher': author || '',
        'emojis': ['✨']
    };
    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    const jsonBuf = Buffer.from(JSON.stringify(json), 'utf-8');
    exifAttr.writeUInt32LE(jsonBuf.length, 14);
    return Buffer.concat([exifAttr, jsonBuf]);
}

async function addExifToWebp(webpBuffer, packname, author) {
    if (webpBuffer.toString('ascii', 0, 4) !== 'RIFF' || webpBuffer.toString('ascii', 8, 12) !== 'WEBP') {
        throw new Error('Invalid WebP buffer');
    }

    const chunks = [];
    let offset = 12;
    let hasVP8X = false;

    while (offset < webpBuffer.length) {
        const fourcc = webpBuffer.toString('ascii', offset, offset + 4);
        const size = webpBuffer.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        const dataEnd = dataStart + size;
        const chunkData = Buffer.from(webpBuffer.subarray(dataStart, dataEnd));

        if (fourcc !== 'EXIF') {
            if (fourcc === 'VP8X') {
                hasVP8X = true;
                chunkData[0] |= 0x08;
            }
            chunks.push({ fourcc, data: chunkData });
        }
        offset = dataEnd + (size % 2);
    }

    if (!hasVP8X) {
        const meta = await sharp(webpBuffer).metadata();
        const w = (meta.width || 512) - 1;
        const h = (meta.height || 512) - 1;
        const vp8xData = Buffer.alloc(10, 0);
        vp8xData[0] = 0x08 | (meta.hasAlpha ? 0x10 : 0x00);
        vp8xData[4] = w & 0xff;
        vp8xData[5] = (w >> 8) & 0xff;
        vp8xData[6] = (w >> 16) & 0xff;
        vp8xData[7] = h & 0xff;
        vp8xData[8] = (h >> 8) & 0xff;
        vp8xData[9] = (h >> 16) & 0xff;
        chunks.unshift({ fourcc: 'VP8X', data: vp8xData });
    }

    chunks.push({ fourcc: 'EXIF', data: buildExifPayload(packname, author) });

    const outParts = [Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')];
    for (const c of chunks) {
        const header = Buffer.alloc(8);
        header.write(c.fourcc, 0, 4, 'ascii');
        header.writeUInt32LE(c.data.length, 4);
        outParts.push(header, c.data);
        if (c.data.length % 2 === 1) outParts.push(Buffer.from([0x00]));
    }

    const finalBuf = Buffer.concat(outParts);
    finalBuf.writeUInt32LE(finalBuf.length - 8, 4);
    return finalBuf;
}

// ==========================================
// 📦 MEDIA HELPERS (Zero-RAM Disk Streaming)
// ==========================================
function unwrapMessage(m) {
    if (!m) return null;
    if (m.ephemeralMessage) return unwrapMessage(m.ephemeralMessage.message);
    if (m.viewOnceMessage) return unwrapMessage(m.viewOnceMessage.message);
    if (m.viewOnceMessageV2) return unwrapMessage(m.viewOnceMessageV2.message);
    if (m.viewOnceMessageV2Extension) return unwrapMessage(m.viewOnceMessageV2Extension.message);
    if (m.documentWithCaptionMessage) return unwrapMessage(m.documentWithCaptionMessage.message);
    return m;
}

function getMedia(msg) {
    const rawQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = unwrapMessage(rawQuoted) || unwrapMessage(msg.message);
    if (!target) return null;

    if (target.stickerMessage) return { mediaMsg: target.stickerMessage, mediaType: 'sticker', ext: 'webp', kind: 'sticker' };
    if (target.imageMessage) return { mediaMsg: target.imageMessage, mediaType: 'image', ext: 'jpg', kind: 'image' };
    if (target.videoMessage) return { mediaMsg: target.videoMessage, mediaType: 'video', ext: 'mp4', kind: 'video' };
    return null;
}

async function downloadToTemp(mediaMsg, mediaType, ext) {
    const tempFile = path.join(os.tmpdir(), `nova_stk_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`);
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

function hasAudioStream(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err || !metadata || !Array.isArray(metadata.streams)) return resolve(false);
            resolve(metadata.streams.some((s) => s.codec_type === 'audio'));
        });
    });
}

// Shared Image/Video -> WebP Buffer converter (with 3-Tier Video Compression < 480 KB)
async function mediaToWebpBuffer(inputPath, kind, outWebp) {
    if (kind === 'image') {
        return await sharp(inputPath)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 80 })
            .toBuffer();
    }

    const tiers = [
        { fps: 14, dur: 7, q: 45, size: 512 },
        { fps: 10, dur: 6, q: 25, size: 384 },
        { fps: 8,  dur: 5, q: 12, size: 280 }
    ];

    for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    '-t', String(t.dur),
                    '-vf', `fps=${t.fps},scale=${t.size}:${t.size}:force_original_aspect_ratio=decrease,pad=${t.size}:${t.size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,scale=512:512,format=yuva420p`,
                    '-vcodec', 'libwebp',
                    '-lossless', '0',
                    '-q:v', String(t.q),
                    '-compression_level', '6',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an'
                ])
                .on('end', resolve)
                .on('error', reject)
                .save(outWebp);
        });

        const stat = await fs.stat(outWebp);
        if (stat.size <= 480 * 1024 || i === tiers.length - 1) break;
    }

    return await fs.readFile(outWebp);
}

function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function wrapText(text, maxChars = 12) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
        if ((current + ' ' + word).trim().length <= maxChars) {
            current = (current + ' ' + word).trim();
        } else {
            if (current) lines.push(current);
            current = word.length > maxChars ? word.slice(0, maxChars) : word;
        }
    }
    if (current) lines.push(current);
    return lines.slice(0, 5);
}

// ==========================================
// 🚀 COMMANDS EXPORT
// ==========================================
module.exports = [
    // ==========================================
    // 🌈 1. ATTP (Text to Animated Rainbow Sticker)
    // ==========================================
    {
        command: 'attp',
        aliases: ['ttp'],
        category: 'sticker',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const text = args.join(' ').trim();
            if (!text) return reply(`⚠️ *ᴘʀᴏᴠɪᴅᴇ ᴛᴇxᴛ!*\n_ᴇx: ${prefix}attp Hello Bro_`);

            await sock.sendMessage(from, { react: { text: '🌈', key: msg.key } });

            const jobDir = path.join(os.tmpdir(), `nova_attp_${Date.now()}`);
            const outWebp = path.join(jobDir, 'out.webp');

            try {
                await fs.ensureDir(jobDir);
                const colors = ['#FF0055', '#FFCC00', '#00FF88', '#00D4FF', '#B84DFF', '#FFFFFF'];
                const lines = wrapText(text, text.length > 25 ? 14 : 10);
                const fontSize = lines.length >= 4 ? 64 : lines.length === 3 ? 78 : lines.length === 2 ? 92 : 105;
                const lineHeight = fontSize * 1.15;
                const startY = 256 - ((lines.length - 1) * lineHeight) / 2;

                for (let i = 0; i < colors.length; i++) {
                    const tspans = lines.map((line, idx) =>
                        `<tspan x="256" y="${Math.round(startY + idx * lineHeight)}">${escapeXml(line)}</tspan>`
                    ).join('');

                    const svg = `
                        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                            <text text-anchor="middle" dominant-baseline="central"
                                font-family="sans-serif" font-weight="900" font-size="${fontSize}"
                                fill="${colors[i]}" stroke="#000000" stroke-width="10" paint-order="stroke">
                                ${tspans}
                            </text>
                        </svg>`;

                    await sharp(Buffer.from(svg)).png().toFile(path.join(jobDir, `frame_${i}.png`));
                }

                await new Promise((resolve, reject) => {
                    ffmpeg(path.join(jobDir, 'frame_%d.png'))
                        .inputOptions(['-framerate', '6'])
                        .outputOptions([
                            '-vcodec', 'libwebp',
                            '-lossless', '0',
                            '-q:v', '75',
                            '-loop', '0',
                            '-an'
                        ])
                        .on('end', resolve)
                        .on('error', reject)
                        .save(outWebp);
                });

                const cfg = getStickerConfig();
                const userName = msg.pushName || 'User';
                const author = cfg.author === 'auto' ? userName : cfg.author;

                const rawBuf = await fs.readFile(outWebp);
                const finalSticker = await addExifToWebp(rawBuf, cfg.packname, author);

                await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ᴀᴛᴛᴘ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(jobDir);
            }
        }
    },

    // ==========================================
    // 🧩 2. STICKER (Image / Video -> BotName • UserName)
    // ==========================================
    {
        command: 'sticker',
        aliases: ['s', 'stiker', 'stk'],
        category: 'sticker',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMedia(msg);

            if (!info || (info.kind !== 'image' && info.kind !== 'video')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀɴ ɪᴍᴀɢᴇ ᴏʀ ᴠɪᴅᴇᴏ ᴡɪᴛʜ ${prefix}s*`);
            }

            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            let inputPath = null;
            const outWebp = path.join(os.tmpdir(), `nova_s_${Date.now()}.webp`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                const webpBuffer = await mediaToWebpBuffer(inputPath, info.kind, outWebp);

                const cfg = getStickerConfig();
                const userName = msg.pushName || 'User';
                const packname = cfg.packname || 'ɴᴏʀᴀ ʙᴏᴛ';
                const author = cfg.author === 'auto' ? userName : cfg.author;

                const finalSticker = await addExifToWebp(webpBuffer, packname, author);
                await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜱᴛɪᴄᴋᴇʀ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outWebp);
            }
        }
    },

    // ==========================================
    // 🎞️ 3. GIF (Sticker / Image / Video -> WhatsApp GIF)
    // ==========================================
    {
        command: 'gif',
        aliases: ['togif'],
        category: 'sticker',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMedia(msg);

            if (!info) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ꜱᴛɪᴄᴋᴇʀ, ɪᴍᴀɢᴇ, ᴏʀ ᴠɪᴅᴇᴏ ᴡɪᴛʜ ${prefix}gif*`);
            }

            await sock.sendMessage(from, { react: { text: '🎞️', key: msg.key } });

            let inputPath = null;
            const tempGif = path.join(os.tmpdir(), `nova_tmp_${Date.now()}.gif`);
            const outMp4 = path.join(os.tmpdir(), `nova_gif_${Date.now()}.mp4`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);

                if (info.kind === 'video') {
                    await new Promise((resolve, reject) => {
                        ffmpeg(inputPath)
                            .noAudio()
                            .outputOptions(['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
                            .on('end', resolve)
                            .on('error', reject)
                            .save(outMp4);
                    });
                } else if (info.kind === 'image') {
                    await new Promise((resolve, reject) => {
                        ffmpeg(inputPath)
                            .inputOptions(['-loop', '1'])
                            .outputOptions(['-t', '2', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
                            .on('end', resolve)
                            .on('error', reject)
                            .save(outMp4);
                    });
                } else if (info.kind === 'sticker') {
                    await sharp(inputPath, { animated: true }).gif().toFile(tempGif);
                    await new Promise((resolve, reject) => {
                        ffmpeg(tempGif)
                            .outputOptions([
                                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                                '-c:v', 'libx264', '-preset', 'veryfast',
                                '-pix_fmt', 'yuv420p', '-movflags', '+faststart'
                            ])
                            .on('end', resolve)
                            .on('error', reject)
                            .save(outMp4);
                    });
                }

                await sock.sendMessage(from, {
                    video: { url: outMp4 },
                    gifPlayback: true,
                    mimetype: 'video/mp4',
                    caption: NORA_FOOTER
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ɢɪꜰ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, tempGif, outMp4);
            }
        }
    },

    // ==========================================
    // 🖼️ 4. PHOTO (Sticker / GIF -> Image)
    // ==========================================
    {
        command: 'photo',
        aliases: ['toimg', 'toimage', 'img'],
        category: 'sticker',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMedia(msg);

            if (!info || (info.kind !== 'sticker' && info.kind !== 'video')) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ꜱᴛɪᴄᴋᴇʀ ᴏʀ ɢɪꜰ ᴡɪᴛʜ ${prefix}photo*`);
            }

            await sock.sendMessage(from, { react: { text: '🖼️', key: msg.key } });

            let inputPath = null;
            const outPng = path.join(os.tmpdir(), `nova_img_${Date.now()}.png`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);

                if (info.kind === 'sticker') {
                    await sharp(inputPath).png().toFile(outPng);
                } else {
                    await new Promise((resolve, reject) => {
                        ffmpeg(inputPath)
                            .outputOptions(['-vframes', '1'])
                            .on('end', resolve)
                            .on('error', reject)
                            .save(outPng);
                    });
                }

                await sock.sendMessage(from, {
                    image: { url: outPng },
                    caption: NORA_FOOTER
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ᴘʜᴏᴛᴏ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outPng);
            }
        }
    },

    // ==========================================
    // 🏷️ 5. PACKNAME (View / Change Default Sticker Packname)
    // ==========================================
    {
        command: 'packname',
        aliases: ['setpack', 'setpackname'],
        category: 'sticker',
        async execute(sock, msg, args, { reply, prefix, isOwner }) {
            const exactText = getExactRawArgs(msg);
            const current = getStickerConfig();

            if (!exactText || !exactText.trim()) {
                return reply(
                    `╭━━〔 ꜱᴛɪᴄᴋᴇʀ ᴘᴀᴄᴋɴᴀᴍᴇ 〕━━╮\n` +
                    `┃  ᴡʜɪᴛᴇ : ${current.packname}\n` +
                    `┃  ɢʀᴇʏ  : ${current.author === 'auto' ? 'User Name (Auto)' : (current.author || 'None')}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `_ᴄʜᴀɴɢᴇ: ${prefix}packname Nora Bot_\n` +
                    `_ᴄᴜꜱᴛᴏᴍ ɢʀᴇʏ: ${prefix}packname Nora Bot | Madhav_\n` +
                    `_ʀᴇꜱᴇᴛ: ${prefix}packname reset_`
                );
            }

            if (!isOwner) {
                return reply('⚠️ *ᴏɴʟʏ ᴏᴡɴᴇʀ ᴄᴀɴ ᴄʜᴀɴɢᴇ ᴅᴇꜰᴀᴜʟᴛ ᴘᴀᴄᴋɴᴀᴍᴇ!*');
            }

            if (exactText.trim().toLowerCase() === 'reset') {
                saveStickerConfig('ɴᴏʀᴀ ʙᴏᴛ', 'auto');
                return reply(`✅ *ᴘᴀᴄᴋɴᴀᴍᴇ ʀᴇꜱᴇᴛ!*\n\n*ᴡʜɪᴛᴇ:* ɴᴏʀᴀ ʙᴏᴛ\n*ɢʀᴇʏ:* User Name (Auto)`);
            }

            if (exactText.includes('|')) {
                const { packname, author } = splitPackAndAuthor(exactText);
                saveStickerConfig(packname, author);
                return reply(`✅ *ᴘᴀᴄᴋɴᴀᴍᴇ ᴜᴘᴅᴀᴛᴇᴅ!*\n\n*ᴡʜɪᴛᴇ:* ${packname}\n*ɢʀᴇʏ:* ${author || 'None'}`);
            } else {
                saveStickerConfig(exactText, 'auto');
                return reply(`✅ *ᴘᴀᴄᴋɴᴀᴍᴇ ᴜᴘᴅᴀᴛᴇᴅ!*\n\n*ᴡʜɪᴛᴇ:* ${exactText}\n*ɢʀᴇʏ:* User Name (Auto)`);
            }
        }
    },

    // ==========================================
    // ✂️ 6. TAKE (Exact Fonts/Gaps Preserved)
    // ==========================================
    {
        command: 'take',
        aliases: ['steal', 'wm'],
        category: 'sticker',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMedia(msg);

            if (!info) {
                return reply(`⚠️ *ʀᴇᴘʟʏ ᴛᴏ ᴀ ꜱᴛɪᴄᴋᴇʀ, ᴘʜᴏᴛᴏ, ᴏʀ ᴠɪᴅᴇᴏ ᴡɪᴛʜ ${prefix}take [text]*`);
            }

            await sock.sendMessage(from, { react: { text: '🏷️', key: msg.key } });

            let inputPath = null;
            const outWebp = path.join(os.tmpdir(), `nova_tk_${Date.now()}.webp`);

            try {
                inputPath = await downloadToTemp(info.mediaMsg, info.mediaType, info.ext);
                const exactText = getExactRawArgs(msg);
                const userName = msg.pushName || 'User';

                let packname = '';
                let author = '';

                if (!exactText || !exactText.trim()) {
                    if (info.kind === 'sticker') {
                        packname = 'ɴᴏʀᴀ x ᴍᴅ';
                        author = '';
                    } else {
                        const cfg = getStickerConfig();
                        packname = cfg.packname || 'ɴᴏʀᴀ ʙᴏᴛ';
                        author = cfg.author === 'auto' ? userName : cfg.author;
                    }
                } else {
                    const parsed = splitPackAndAuthor(exactText);
                    packname = parsed.packname;
                    author = parsed.author;
                }

                const rawWebp = info.kind === 'sticker'
                    ? await fs.readFile(inputPath)
                    : await mediaToWebpBuffer(inputPath, info.kind, outWebp);

                const finalSticker = await addExifToWebp(rawWebp, packname, author);
                await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ᴛᴀᴋᴇ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(inputPath, outWebp);
            }
        }
    },

    // ==========================================
    // 🔊 7. AUDSTICKER (Native WhatsApp Sound Sticker with Speaker Icon!)
    // ==========================================
    {
        command: 'audsticker',
        aliases: ['audiosticker', 'asticker', 'soundsticker', 'as'],
        category: 'sticker',
        async execute(sock, msg, args, { reply, prefix }) {
            const from = msg.key.remoteJid;
            const info = getMedia(msg);

            if (!info || info.kind !== 'video') {
                return reply(`⚠️ *ꜱᴇɴᴅ ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴅᴇᴏ ᴡɪᴛʜ ${prefix}audsticker*`);
            }

            await sock.sendMessage(from, { react: { text: '🔊', key: msg.key } });

            const tempDir = path.join(__dirname, '../../temp');
            await fs.ensureDir(tempDir);

            const jobId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
            let mp4Path = null;
            const webpPath = path.join(tempDir, `audstk_out_${jobId}.webp`);
            const oggPath = path.join(tempDir, `audstk_out_${jobId}.ogg`);

            try {
                // 1. Download video
                const downloaded = await downloadToTemp(info.mediaMsg, info.mediaType, 'mp4');
                mp4Path = path.join(tempDir, `audstk_in_${jobId}.mp4`);
                await fs.move(downloaded, mp4Path, { overwrite: true });

                // 2. Check for audio stream
                const videoHasAudio = await hasAudioStream(mp4Path);

                // 3. Convert video to clean Animated WebP (< 480 KB, transparent, auto-downloads) + EXIF
                const rawWebp = await mediaToWebpBuffer(mp4Path, 'video', webpPath);
                const cfg = getStickerConfig();
                const userName = msg.pushName || 'User';
                const packname = cfg.packname || 'ɴᴏʀᴀ ʙᴏᴛ';
                const author = cfg.author === 'auto' ? userName : cfg.author;

                const finalWebp = await addExifToWebp(rawWebp, packname, author);

                // Fallback if video has NO audio track
                if (!videoHasAudio) {
                    await sock.sendMessage(from, { sticker: finalWebp }, { quoted: msg });
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                    return;
                }

                // 4. Extract audio to WhatsApp Opus/OGG
                await new Promise((resolve, reject) => {
                    ffmpeg(mp4Path)
                        .outputOptions([
                            '-t', '7',
                            '-vn',
                            '-acodec', 'libopus',
                            '-ac', '1',
                            '-ar', '16000'
                        ])
                        .on('end', resolve)
                        .on('error', reject)
                        .save(oggPath);
                });

                // 5. Upload both payloads separately
                const { audioMessage } = await prepareWAMessageMedia(
                    { audio: fs.readFileSync(oggPath), mimetype: 'audio/ogg; codecs=opus', ptt: true },
                    { upload: sock.waUploadToServer }
                );
                delete audioMessage.ptt;
                audioMessage.contextInfo = {};

                const { stickerMessage } = await prepareWAMessageMedia(
                    { sticker: finalWebp },
                    { upload: sock.waUploadToServer }
                );

                // 6. Attach Sound Sticker fields (encoded via proto patch field 24/25/26 + wrapper 134)
                stickerMessage.premium = 0;
                stickerMessage.isAnimated = finalWebp.includes('ANIM');
                stickerMessage.emojis = '🔊';
                stickerMessage.audioMessage = audioMessage;

                const waMsg = generateWAMessageFromContent(
                    from,
                    { stickerMessage },
                    { userJid: sock.user.id, quoted: msg }
                );

                await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ᴀᴜᴅꜱᴛɪᴄᴋᴇʀ ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            } finally {
                await cleanup(mp4Path, webpPath, oggPath);
            }
        }
    }
];