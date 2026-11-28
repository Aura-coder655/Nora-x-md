const os = require('os');

const toSmallCaps = (text) => {
    const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ',
        'i': 'ɪ', 'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ',
        'q': 'ǫ', 'r': 'ʀ', 's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x',
        'y': 'ʏ', 'z': 'ᴢ'
    };
    return String(text).toLowerCase().split('').map(c => map[c] || c).join('');
};

module.exports = {
    command: 'menu',
    aliases: ['help', 'commands'],
    category: 'general',
    execute: async (sock, msg, args, { prefix, activeSettings, commands, from, config }) => {
        // External ഉണ്ടെങ്കിൽ അത് അതുപോലെ എടുക്കും, ഇല്ലെങ്കിൽ Default Small Caps
        const botName = activeSettings.botName ? activeSettings.botName : toSmallCaps('NORA X MD');
        const ownerName = activeSettings.ownerName ? activeSettings.ownerName : toSmallCaps('Madhav'); 
        const userName = msg.pushName ? msg.pushName : toSmallCaps('User');
        const prefixStr = prefix ? prefix : toSmallCaps('None');

        const freeMem = (os.freemem() / (1024 * 1024)).toFixed(0);
        const totalMem = (os.totalmem() / (1024 * 1024)).toFixed(0);
        const memStr = `${freeMem} ᴍʙ / ${totalMem} ᴍʙ`;

        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600).toString().padStart(2, '0');
        const m = Math.floor((uptime % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(uptime % 60).toString().padStart(2, '0');
        const uptimeStr = `${h}:${m}:${s}`;

        let visiblePluginsCount = 0; 
        const categories = {};
        
        commands.forEach((cmd) => {
            if (cmd.category === 'hidden') return;
            
            const cat = (cmd.category || 'general').toUpperCase();
            if (!categories[cat]) categories[cat] = [];
            
            const mainCommand = cmd.command.toLowerCase();
            if (!categories[cat].includes(mainCommand)) {
                categories[cat].push(mainCommand);
                visiblePluginsCount++; 
            }
        });

        const totalUsers = config.getTotalUsers ? config.getTotalUsers() : 1;

        let menuStr = `╭━━━『 ${botName} 』━━━╮\n` +
                      `┃\n` +
                      `┃  ᴜꜱᴇʀ      : ${userName}\n` +
                      `┃  ᴏᴡɴᴇʀ     : ${ownerName}\n` +
                      `┃  ᴘʀᴇꜰɪx    : ${prefixStr}\n` +
                      `┃  ᴍᴏᴅᴇ      : ᴘᴜʙʟɪᴄ\n` +
                      `┃  ᴘʟᴀᴛꜰᴏʀᴍ : ᴡʜᴀᴛꜱᴀᴘᴘ\n` +
                      `┃  ᴍᴇᴍᴏʀʏ    : ${memStr}\n` +
                      `┃  ᴜᴘᴛɪᴍᴇ    : ${uptimeStr}\n` +
                      `┃  ᴜꜱᴇʀꜱ     : ${totalUsers}\n` +
                      `┃  ᴘʟᴜɢɪɴꜱ   : ${visiblePluginsCount}\n` +
                      `┃\n` +
                      `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                      `      ▰▰▰ ᴄᴏᴍᴍᴀɴᴅ ʜᴜʙ ▰▰▰\n\n`;

        for (const cat in categories) {
            const catTitle = toSmallCaps(cat);
            
            menuStr += `╭━━〔 ${catTitle} 〕━━\n`;
            categories[cat].forEach(c => {
                menuStr += `┃ ◈ ${toSmallCaps(c)}\n`;
            });
            menuStr += `╰━━━━━━━━━━━━━━\n\n`;
        }

        menuStr += `> ${botName} . 2026`;

        await sock.sendMessage(from, {
            image: { url: activeSettings.menuImage || 'https://files.catbox.moe/6vit0z.png' },
            caption: menuStr
        }, { quoted: msg });
    }
};