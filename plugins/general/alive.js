module.exports = {
    command: 'alive',
    aliases: ['on', 'status'],
    category: 'general',
    execute: async (sock, msg, args, { from, config }) => {
        // Calculate system uptime
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600).toString().padStart(2, '0');
        const m = Math.floor((uptime % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(uptime % 60).toString().padStart(2, '0');
        const uptimeStr = `${h}ʜ ${m}ᴍ ${s}s`;

        // Fetch current date in IST timezone
        const dateStr = new Date().toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        
        // Fetch owner name from config or default to Madhav
        const ownerName = config?.settings?.ownerName || 'ᴍᴀᴅʜᴀᴠ';

        // Construct the alive message (Bold & Small Caps formatting)
        const aliveMsg = `*🦋 ɴᴏʀᴀ x ᴍᴅ ɪs ᴀʟɪᴠᴇ 🦋*\n\n` +
                         `*📅 ᴅᴀᴛᴇ   : ${dateStr}*\n` +
                         `*⏳ ᴜᴘᴛɪᴍᴇ : ${uptimeStr}*\n` +
                         `*👨‍💻 ᴏᴡɴᴇʀ  : ${ownerName.toUpperCase()}*`;

        // React to the user's command message
        await sock.sendMessage(from, { react: { text: '✨', key: msg.key } });
        
        // Send the alive text message reply
        await sock.sendMessage(from, { text: aliveMsg }, { quoted: msg });
    }
};