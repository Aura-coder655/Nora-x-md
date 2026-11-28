const axios = require('axios');

const log = (step, msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] [${step}] : ${msg}`);
};

module.exports = {
    command: 'removebg',
    aliases: ['rbg', 'rmbg', 'nobg'],
    category: 'utility',
    async execute(sock, msg, args, { reply, footerText }) {
        const from = msg.key.remoteJid;
        let query = args.join(' ').trim();
        
        if (!query) {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMsg) {
                query = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
                const match = query.match(/https?:\/\/[^\s]+/);
                if (match) query = match[0];
            }
        }

        if (!query || (!query.includes('http'))) {
            return reply('⚠️ *Provide a valid Image URL!*');
        }

        log('RMBG-START', `Requested Image URL: ${query}`);
        await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

        try {
            log('RMBG-API', `Requesting Kira RemoveBG API...`);
            const apiURL = `https://kiraxmd-api.onrender.com/api/removebg?url=${encodeURIComponent(query)}`;
            const { data } = await axios.get(apiURL, { timeout: 30000 });

            if (!data || !data.status || !data.result || !data.result.removed_bg) {
                throw new Error("Could not remove background from the image.");
            }

            const base64Data = data.result.removed_bg.replace(/^data:image\/\w+;base64,/, "");
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            const caption = `*◈ ɴᴏʀᴀ ʀᴇᴍᴏᴠᴇ-ʙɢ*\n*⚡ ʙᴀᴄᴋɢʀᴏᴜɴᴅ ʀᴇᴍᴏᴠᴇᴅ ✓*`;

            log('RMBG-UPLOAD', `Buffer Ready. Sending image...`);

            await sock.sendMessage(from, { 
                image: imageBuffer, 
                caption: caption + footerText
            }, { quoted: msg });

            log('RMBG-SUCCESS', `Image delivered!`);
            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

        } catch (e) {
            log('RMBG-FATAL', e.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${e.message}` + footerText }, { quoted: msg });
        }
    }
};