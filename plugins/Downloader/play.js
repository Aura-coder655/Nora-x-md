const yt = require('../../lib/yt-engine');

module.exports = [
    {
        command: 'play',
        aliases: ['song', 'music', 'audio', 'yta', 'ytmp3'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, footerText, prefix }) {
            const from = msg.key.remoteJid;
            let query = args.join(' ').trim();

            if (!query) {
                const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                query = q?.conversation || q?.extendedTextMessage?.text || '';
            }

            if (!query) {
                return reply(`⚠️ *Provide a Song Name or YouTube URL!*\n_Ex: ${prefix || '.'}play arz kiya_`);
            }

            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            let filePath = null;
            try {
                let url = yt.youtubeUrlFrom(query);
                if (!url) {
                    const results = await yt.searchYoutube(query, 1);
                    if (!results.length) throw new Error('No songs found on YouTube.');
                    url = results[0].url;
                }

                await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });
                const aud = await yt.downloadAudio(url);
                filePath = aud.path;

                await sock.sendMessage(from, {
                    audio: { url: filePath },
                    mimetype: aud.mimetype,
                    ptt: false,
                    fileName: `${aud.title}.${aud.ext}`
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}` + footerText }, { quoted: msg });
            } finally {
                await yt.cleanup(filePath);
            }
        }
    }
];