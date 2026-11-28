module.exports = [
    // ==========================================
    // 🔧 1. SETPREFIX (Owner Only)
    // ==========================================
    {
        command: 'setprefix',
        aliases: ['prefix'],
        category: 'settings',
        async execute(sock, msg, args, { reply, isOwner, activeSettings, config }) {
            if (!isOwner) return reply('❌ *Owner only command!*');

            if (!args[0]) {
                return reply(`⚠️ *Usage:* \n\n.setprefix !\n.setprefix all\n.setprefix . / #`);
            }

            const newPrefixes = args.join(' ').split(/\s+/).filter(Boolean);
            activeSettings.prefix = newPrefixes;

            if (typeof config.saveSettings === 'function') {
                try {
                    config.saveSettings(activeSettings);
                } catch (e) {
                    console.error('❌ saveSettings failed:', e.message);
                    return reply('⚠️ Prefix changed in memory but failed to save to disk.');
                }
            } else {
                console.warn('⚠️ config.saveSettings is missing — prefix will NOT persist after restart.');
            }

            await sock.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });
            return reply(`✅ *Prefix successfully updated to:* ${newPrefixes.join(' | ')}`);
        }
    },

    // ==========================================
    // 🔒 2. MODE (Private / Public — Owner & Sudo Only)
    // ==========================================
    {
        command: 'mode',
        aliases: ['setmode', 'botmode'],
        category: 'settings',
        async execute(sock, msg, args, { reply, isOwner, isSudo, activeSettings, config, prefix }) {
            if (!isOwner && !isSudo) return reply('❌ *Owner & Sudo only command!*');

            const currentMode = activeSettings.mode || 'public';
            const input = (args[0] || '').toLowerCase();

            if (!input || !['public', 'private', 'self'].includes(input)) {
                return reply(
                    `⚙️ *Current Mode:* ${currentMode.toUpperCase()}\n\n` +
                    `⚠️ *Usage:*\n` +
                    `${prefix || '.'}mode public\n` +
                    `${prefix || '.'}mode private`
                );
            }

            const newMode = input === 'self' ? 'private' : input;
            activeSettings.mode = newMode;

            if (typeof config.saveSettings === 'function') {
                try {
                    config.saveSettings(activeSettings);
                } catch (e) {
                    console.error('❌ saveSettings failed:', e.message);
                    return reply('⚠️ Mode changed in memory but failed to save to disk.');
                }
            } else {
                console.warn('⚠️ config.saveSettings is missing — mode will NOT persist after restart.');
            }

            await sock.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });
            return reply(`✅ *Bot mode updated to:* ${newMode.toUpperCase()}`);
        }
    }
];