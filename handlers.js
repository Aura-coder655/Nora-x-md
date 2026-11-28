const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// --- ⚙️ DYNAMIC PLUGIN ENGINE ---
const commands = new Map();
const pluginsDir = path.join(__dirname, 'plugins');

const loadPluginFile = (filePath, category) => {
    try {
        const plugin = require(filePath);
        const processCmd = (cmd) => {
            if (cmd.command || cmd.name) {
                const cmdName = (cmd.command || cmd.name).toLowerCase();
                cmd.category = cmd.category || category;
                commands.set(cmdName, cmd);

                const aliases = cmd.aliases || cmd.alias;
                if (aliases && Array.isArray(aliases)) {
                    aliases.forEach(a => commands.set(a.toLowerCase(), cmd));
                }
            }
        };

        if (Array.isArray(plugin)) {
            plugin.forEach(processCmd);
        } else if (typeof plugin === 'object') {
            processCmd(plugin);
        }
    } catch (err) {
        console.error(`❌ Failed to load plugin: ${path.basename(filePath)}`, err.message);
    }
};

const loadPlugins = () => {
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
    const items = fs.readdirSync(pluginsDir);

    items.forEach(item => {
        const itemPath = path.join(pluginsDir, item);

        if (fs.statSync(itemPath).isDirectory()) {
            const files = fs.readdirSync(itemPath).filter(f => f.endsWith('.js'));
            files.forEach(file => loadPluginFile(path.join(itemPath, file), item));
        } else if (item.endsWith('.js')) {
            loadPluginFile(itemPath, 'general');
        }
    });
    console.log(`✅ Loaded ${new Set([...commands.values()]).size} unique plugins automatically!`);
};

loadPlugins();

const toSmallCaps = (text) => {
    const map = {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'ǫ','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ','A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ꜰ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'ꜱ','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'};
    return text.split('').map(c => map[c] || c).join('');
};

const cleanDigits = (val) => String(val || '').split('@')[0].split(':')[0].replace(/\D/g, '');

const collectNumbers = (jids) => {
    const nums = new Set();
    for (const jid of jids) {
        if (!jid || typeof jid !== 'string') continue;
        const digits = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
        if (digits) nums.add(digits);
        try {
            const norm = jidNormalizedUser(jid);
            if (norm) {
                const nd = String(norm).split('@')[0].split(':')[0].replace(/\D/g, '');
                if (nd) nums.add(nd);
            }
        } catch (_) {}
    }
    return [...nums];
};

// ==========================================
// 💡 LIGHTWEIGHT JSON DATABASE (RAM Friendly)
// ==========================================
const dbPath = path.join(__dirname, 'nora_db.json');

if (fs.existsSync(dbPath)) {
    const data = fs.readJSONSync(dbPath);
    global.bannedUsers = Array.isArray(data.bannedUsers) ? data.bannedUsers.map(cleanDigits).filter(Boolean) : [];
    global.sudoUsers = Array.isArray(data.sudoUsers) ? data.sudoUsers.map(cleanDigits).filter(Boolean) : [];
} else {
    global.bannedUsers = [];
    global.sudoUsers = [];
    fs.writeJSONSync(dbPath, { bannedUsers: [], sudoUsers: [] });
}

global.saveDB = () => {
    global.bannedUsers = (global.bannedUsers || []).map(cleanDigits).filter(Boolean);
    global.sudoUsers = (global.sudoUsers || []).map(cleanDigits).filter(Boolean);
    fs.writeJSONSync(dbPath, { bannedUsers: global.bannedUsers, sudoUsers: global.sudoUsers }, { spaces: 2 });
};
// ==========================================

// --- 🚀 MAIN HANDLER EXPORT ---
module.exports = async (sock, chatUpdate) => {
    const { messages, type } = chatUpdate;
    if (!messages || messages.length === 0) return;

    const msg = messages[0];

    if (!msg.message) return;
    if (msg.key.id && msg.key.id.startsWith('BAE5')) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');

    // 🔍 Comprehensive JID harvester (groups + DMs, LID-aware)
    const harvestJids = () => {
        const set = new Set();

        const fields = [
            [msg.key, 'participant'],
            [msg.key, 'participantPn'],
            [msg.key, 'participantAlt'],
            [msg.key, 'remoteJid'],
            [msg.key, 'remoteJidAlt'],
            [msg.key, 'senderPn'],
            [msg.key, 'senderLid'],
            [msg, 'participant'],
            [msg, 'participantPn'],
            [msg, 'participantAlt'],
            [msg, 'senderPn'],
            [msg, 'senderLid'],
            [msg, 'sender'],
            [chatUpdate, 'sender'],
            [chatUpdate, 'senderPn'],
            [chatUpdate, 'senderLid'],
        ];

        for (const [obj, key] of fields) {
            if (obj && typeof obj[key] === 'string' && obj[key].includes('@')) {
                set.add(obj[key]);
            }
        }

        if (msg.key && typeof msg.key === 'object') {
            for (const v of Object.values(msg.key)) {
                if (typeof v === 'string' && v.includes('@')) set.add(v);
            }
        }

        return [...set];
    };

    const rawJids = harvestJids();
    const candidateIds = collectNumbers(rawJids);

    const bestJid =
        msg.key.participantPn ||
        msg.key.participantAlt ||
        msg.key.participant ||
        msg.key.senderPn ||
        msg.key.senderLid ||
        msg.key.remoteJidAlt ||
        msg.participantPn ||
        msg.senderPn ||
        msg.key.remoteJid ||
        '';

    const sender = (() => {
        try { return jidNormalizedUser(bestJid) || bestJid; }
        catch (_) { return bestJid; }
    })();

    const senderNumber = cleanDigits(bestJid) || candidateIds[0] || '';
    const rawNumber    = cleanDigits(msg.key.participant || msg.key.participantPn || msg.key.remoteJid || '');
    const chatNumber   = cleanDigits(from);

    const ownerClean = cleanDigits(config.ownerNumber);
    const sudoCleanList = Array.isArray(global.sudoUsers)
        ? global.sudoUsers.map(cleanDigits).filter(Boolean)
        : [];
    const bannedCleanList = Array.isArray(global.bannedUsers)
        ? global.bannedUsers.map(cleanDigits).filter(Boolean)
        : [];

    const isSudo = candidateIds.some(id => sudoCleanList.includes(id));

    const isDirectOwner =
        Boolean(msg.key.fromMe) ||
        Boolean(ownerClean && candidateIds.some(id => id === ownerClean));

    const isOwner = isDirectOwner || isSudo;

    if (candidateIds.some(id => bannedCleanList.includes(id)) && !isOwner) {
        return;
    }

    let content = msg.message?.conversation ||
                  msg.message?.extendedTextMessage?.text ||
                  msg.message?.imageMessage?.caption ||
                  msg.message?.videoMessage?.caption || '';

    if (!content && msg.message?.ephemeralMessage) {
        const eph = msg.message.ephemeralMessage.message;
        content = eph?.conversation || eph?.extendedTextMessage?.text || eph?.imageMessage?.caption || eph?.videoMessage?.caption || '';
    }

    if (!content) return;

    const activeSettings = config.getSettings ? config.getSettings() : (config.settings || {});
    const rawBotName = activeSettings.botName || 'Nora x md';
    const footerText = `\n\n_ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${toSmallCaps(rawBotName)}_`;

    const reply = async (text) => {
        await sock.sendMessage(from, { text: text + footerText }, { quoted: msg });
    };

    if (isGroup && activeSettings.antiLink && !isOwner) {
        const linkPattern = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+)/gi;
        if (linkPattern.test(content)) {
            await sock.sendMessage(from, { delete: msg.key });
            return reply(`⚠️ @${senderNumber} Links are not allowed here!`, { mentions: [sender] });
        }
    }

    let prefixList = activeSettings.prefix || ['.'];
    if (typeof prefixList === 'string') prefixList = prefixList.split(/\s+/);

    let isCmd = false;
    let usedPrefix = '';
    let cmd = '';
    let args = [];

    const allValidCmds = Array.from(commands.keys());

    if (prefixList.includes('all') || prefixList.includes('ALL') || prefixList.includes('')) {
        const match = content.trim().match(/^([\s\S]{0,4}?)([a-zA-Z0-9_]+)(?:\s+(.*))?$/i);
        if (match) {
            const possibleCmd = match[2].toLowerCase();
            if (allValidCmds.includes(possibleCmd)) {
                usedPrefix = match[1].trim();
                cmd = possibleCmd;
                args = match[3] ? match[3].split(/\s+/) : [];
                isCmd = true;
            }
        }
    }

    if (!isCmd) {
        const strictPrefixes = prefixList.filter(p => p.toLowerCase() !== 'all' && p !== '').sort((a, b) => b.length - a.length);
        usedPrefix = strictPrefixes.find(p => content.startsWith(p));

        if (usedPrefix !== undefined) {
            const splitArgs = content.slice(usedPrefix.length).trim().split(/\s+/);
            const possibleCmd = splitArgs.shift().toLowerCase();
            if (allValidCmds.includes(possibleCmd)) {
                cmd = possibleCmd;
                args = splitArgs;
                isCmd = true;
            }
        }
    }

    // ❌ (Menu reply interceptor REMOVED — no more reply-number flow)

    if (!isCmd) return;

    // 🔒 Private Mode Check (Owner & Sudo only)
    if (activeSettings.mode === 'private' && !isOwner) {
        return;
    }

    if (config.saveUser) config.saveUser(senderNumber);
    console.log(`\n[⚡ COMMAND EXECUTED] Command: '${cmd}' | Prefix: '${usedPrefix}' | By: ${senderNumber} (raw: ${rawNumber}) | Mode: ${activeSettings.mode || 'public'} | isOwner: ${isOwner} | isSudo: ${isSudo}`);

    if (commands.has(cmd)) {
        try {
            await commands.get(cmd).execute(sock, msg, args, {
                reply, prefix: usedPrefix, activeSettings, commands, from, sender, senderNumber, isOwner, isSudo, config, footerText
            });
        } catch (err) {
            console.error(`❌ Error in plugin ${cmd}:`, err);
        }
    }
};