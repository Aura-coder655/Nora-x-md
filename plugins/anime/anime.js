const API_BASE = (process.env.KIRAXMD_API || 'https://kiraxmd-api.onrender.com').replace(/\/+$/, '');

async function fetchAnimeApi(endpoint, timeoutMs = 30000) {
    const res = await fetch(`${API_BASE}/api/${endpoint}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`API HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.status || !data?.result) {
        throw new Error(data?.message || 'Could not fetch media from API.');
    }
    return data.result;
}

function createImageCommand(command, endpoint, title, aliases = []) {
    return {
        command,
        aliases,
        category: 'anime',
        async execute(sock, msg, args, { reply, footerText }) {
            const from = msg.key.remoteJid;
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            try {
                const url = await fetchAnimeApi(endpoint);
                const caption = `*◈ ${title}*` + (footerText || '\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɴᴏʀᴀ_');

                await sock.sendMessage(
                    from,
                    {
                        image: { url },
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
    };
}

module.exports = [
    {
        command: 'astatus',
        aliases: ['animestatus', 'amv'],
        category: 'anime',
        async execute(sock, msg, args, { reply, footerText }) {
            const from = msg.key.remoteJid;
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            try {
                const url = await fetchAnimeApi('astatus');
                const caption = `*◈ ᴀɴɪᴍᴇ ꜱᴛᴀᴛᴜꜱ*` + (footerText || '\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɴᴏʀᴀ_');

                await sock.sendMessage(
                    from,
                    {
                        video: { url },
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
        command: 'couplepp',
        aliases: ['cpp', 'couple'],
        category: 'anime',
        async execute(sock, msg, args, { reply, footerText }) {
            const from = msg.key.remoteJid;
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            try {
                const result = await fetchAnimeApi('couplepp');
                const footer = footerText || '\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɴᴏʀᴀ_';

                if (result.male) {
                    await sock.sendMessage(
                        from,
                        {
                            image: { url: result.male },
                            caption: `*◈ ᴄᴏᴜᴘʟᴇ ᴘᴘ (ᴍᴀʟᴇ)*${footer}`
                        },
                        { quoted: msg }
                    );
                }

                if (result.female) {
                    await sock.sendMessage(
                        from,
                        {
                            image: { url: result.female },
                            caption: `*◈ ᴄᴏᴜᴘʟᴇ ᴘᴘ (ꜰᴇᴍᴀʟᴇ)*${footer}`
                        },
                        { quoted: msg }
                    );
                }

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
            } catch (err) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                reply(`❌ *ꜰᴀɪʟᴇᴅ:* ${err.message}`);
            }
        }
    },
    createImageCommand('itachi', 'itachi', 'ɪᴛᴀᴄʜɪ'),
    createImageCommand('itori', 'itori', 'ɪᴛᴏʀɪ'),
    createImageCommand('loli', 'loli', 'ʟᴏʟɪ'),
    createImageCommand('miku', 'miku', 'ᴍɪᴋᴜ'),
    createImageCommand('naruto', 'naruto', 'ɴᴀʀᴜᴛᴏ'),
    createImageCommand('nezuko', 'nezuko', 'ɴᴇᴢᴜᴋᴏ'),
    createImageCommand('waifu', 'waifu', 'ᴡᴀɪꜰᴜ')
];