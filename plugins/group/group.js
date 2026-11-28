const log = (step, msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] [${step}] : ${msg}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = [
    // ==========================================
    // 👥 1. ADD MEMBER COMMAND
    // ==========================================
    {
        command: 'add',
        aliases: ['addmember', 'invite'],
        category: 'group',
        async execute(sock, msg, args, { reply, isOwner }) { // 👈 isOwner destructured here
            const from = msg.key.remoteJid;
            if (!from.endsWith('@g.us')) return reply('⚠️ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!');

            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                const getNum = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';
                
                const botNum = getNum(sock.user?.id);
                const senderNum = getNum(msg.key.participant || msg.key.remoteJid);

                const botData = participants.find(p => getNum(p.id) === botNum || (p.phoneNumber && getNum(p.phoneNumber) === botNum));
                const senderData = participants.find(p => getNum(p.id) === senderNum || (p.phoneNumber && getNum(p.phoneNumber) === senderNum));

                const isBotAdmin = botData && (botData.admin === 'admin' || botData.admin === 'superadmin');
                
                // 🚀 SUDO / OWNER BYPASS: Owner or Sudo can add even if not WhatsApp group admin
                const isGroupAdmin = senderData && (senderData.admin === 'admin' || senderData.admin === 'superadmin');
                const isAdmin = isGroupAdmin || isOwner; 

                if (!isBotAdmin) return reply('⚠️ ɪ ɴᴇᴇᴅ ᴛᴏ ʙᴇ ᴀɴ ᴀᴅᴍɪɴ ᴛᴏ ᴀᴅᴅ ᴍᴇᴍʙᴇʀs!');
                if (!isAdmin) return reply('⚠️ ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ sᴜᴅᴏ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!');

                let usersToAdd = [];
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;

                if (quotedMsg && quotedMsg.participant) usersToAdd.push(quotedMsg.participant);
                if (quotedMsg && quotedMsg.mentionedJid && quotedMsg.mentionedJid.length > 0) usersToAdd.push(...quotedMsg.mentionedJid);

                if (args.length > 0 && usersToAdd.length === 0) {
                    let textInput = args.join('');
                    if (textInput.includes(',')) {
                        let nums = textInput.split(',');
                        nums.forEach(n => {
                            let cleaned = n.replace(/[^0-9]/g, '');
                            if (cleaned.length > 5) usersToAdd.push(`${cleaned}@s.whatsapp.net`);
                        });
                    } else {
                        let cleaned = textInput.replace(/[^0-9]/g, '');
                        if (cleaned.length > 5) usersToAdd.push(`${cleaned}@s.whatsapp.net`);
                    }
                }

                if (usersToAdd.length === 0) return reply('⚠️ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴜsᴇʀ, ᴍᴇɴᴛɪᴏɴ ᴛʜᴇᴍ, ᴏʀ ᴘʀᴏᴠɪᴅᴇ ᴛʜᴇɪʀ ɴᴜᴍʙᴇ🇷!');

                usersToAdd = [...new Set(usersToAdd)];
                await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

                const response = await sock.groupParticipantsUpdate(from, usersToAdd, 'add');
                let successMsg = ``;
                let hasAdded = false;

                for (let res of response) {
                    const status = res.status;
                    const number = (res.id || usersToAdd[0]).split('@')[0];

                    if (status == 200) {
                        successMsg += `✅ ɴᴏʀᴀ ᴀᴅᴅᴇᴅ @${number} sᴜᴄᴄᴇssꜰᴜʟʟʏ\n`;
                        hasAdded = true;
                    } else if (status == 403) {
                        successMsg += `⚠️ ᴘʀɪᴠᴀᴄʏ sᴇᴛᴛɪɴɢs (ɪɴᴠɪᴛᴇ sᴇɴᴛ ᴛᴏ @${number})\n`;
                    } else if (status == 409) {
                        successMsg += `ℹ️ @${number} ɪs ᴀʟʀᴇᴀᴅʏ ɪɴ ᴛʜᴇ ɢʀᴏᴜᴘ\n`;
                    } else if (status == 408) {
                        successMsg += `❌ @${number} ʀᴇᴄᴇɴᴛʟʏ ʟᴇꜰᴛ (ᴄᴀɴɴᴏᴛ ᴀᴅᴅ)\n`;
                    } else if (status == 401) {
                        successMsg += `❌ @${number} ʙᴏᴛ ʙʟᴏᴄᴋᴇᴅ ᴏʀ ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ\n`;
                    } else {
                        successMsg += `❌ ꜰᴀɪʟᴇᴅ ᴛᴏ ᴀᴅᴅ @${number}\n`;
                    }
                }

                await sock.sendMessage(from, { text: successMsg.trim(), mentions: usersToAdd }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: hasAdded ? '✅' : 'ℹ️', key: msg.key } });

            } catch (e) {
                log('GROUP-ADD-FATAL', e.message);
                reply(`❌ ꜰᴀɪʟᴇᴅ ᴛᴏ ᴘʀᴏᴄᴇss ʀᴇǫᴜᴇsᴛ.`);
            }
        }
    },

    // ==========================================
    // 🚷 2. KICK MEMBER COMMAND
    // ==========================================
    {
        command: 'kick',
        aliases: ['remove'],
        category: 'group',
        async execute(sock, msg, args, { reply, isOwner }) {
            const from = msg.key.remoteJid;
            if (!from.endsWith('@g.us')) return reply('⚠️ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!');

            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                const getNum = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';
                
                const botNum = getNum(sock.user?.id);
                const senderNum = getNum(msg.key.participant || msg.key.remoteJid);

                const botData = participants.find(p => getNum(p.id) === botNum || (p.phoneNumber && getNum(p.phoneNumber) === botNum));
                const senderData = participants.find(p => getNum(p.id) === senderNum || (p.phoneNumber && getNum(p.phoneNumber) === senderNum));

                const isBotAdmin = botData && (botData.admin === 'admin' || botData.admin === 'superadmin');
                
                const isGroupAdmin = senderData && (senderData.admin === 'admin' || senderData.admin === 'superadmin');
                const isAdmin = isGroupAdmin || isOwner; 

                if (!isBotAdmin) return reply('⚠️ ɪ ɴᴇᴇᴅ ᴛᴏ ʙᴇ ᴀɴ ᴀᴅᴍɪɴ ᴛᴏ ᴋɪᴄᴋ ᴍᴇᴍʙᴇʀs!');
                if (!isAdmin) return reply('⚠️ ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ sᴜᴅᴏ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!');

                let usersToKick = [];
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;

                if (quotedMsg && quotedMsg.participant) usersToKick.push(quotedMsg.participant);
                if (quotedMsg && quotedMsg.mentionedJid && quotedMsg.mentionedJid.length > 0) usersToKick.push(...quotedMsg.mentionedJid);

                if (!usersToKick.length && args.length > 0) {
                    let cleaned = args.join('').replace(/[^0-9]/g, '');
                    if (cleaned.length > 5) usersToKick.push(`${cleaned}@s.whatsapp.net`);
                }

                if (usersToKick.length === 0) return reply('⚠️ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴜsᴇʀ, ᴍᴇɴᴛɪᴏɴ ᴛʜᴇᴍ, ᴏʀ ᴘʀᴏᴠɪᴅᴇ ᴛʜᴇɪʀ ɴᴜᴍʙᴇ🇷!');

                usersToKick = usersToKick.filter(jid => getNum(jid) !== botNum && getNum(jid) !== senderNum);
                if (usersToKick.length === 0) return reply('⚠️ ʏᴏᴜ ᴄᴀɴɴᴏᴛ ᴋɪᴄᴋ ʏᴏᴜʀsᴇʟꜰ ᴏʀ ᴛʜᴇ ʙᴏْت!');

                usersToKick = [...new Set(usersToKick)];
                await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

                const response = await sock.groupParticipantsUpdate(from, usersToKick, 'remove');
                let successMsg = ``;
                let hasKicked = false;

                for (let res of response) {
                    const status = res.status;
                    const number = (res.id || usersToKick[0]).split('@')[0];

                    if (status == 200) {
                        successMsg += `✅ ɴᴏʀᴀ ᴋɪᴄᴋᴇᴅ @${number} ʙʏᴇ💔\n`;
                        hasKicked = true;
                    } else {
                        successMsg += `❌ ꜰᴀɪʟᴇᴅ ᴛᴏ ᴋɪᴄᴋ @${number}\n`;
                    }
                }

                await sock.sendMessage(from, { text: successMsg.trim(), mentions: usersToKick }, { quoted: msg });
                await sock.sendMessage(from, { react: { text: hasKicked ? '✅' : '❌', key: msg.key } });

            } catch (e) {
                log('GROUP-KICK-FATAL', e.message);
                reply(`❌ ꜰᴀɪʟᴇᴅ ᴛᴏ ᴘʀᴏᴄᴇss ʀᴇǫᴜᴇsᴛ.`);
            }
        }
    },

    // ==========================================
    // ☢️ 3. KICK ALL COMMAND
    // ==========================================
    {
        command: 'kickall',
        aliases: ['removeall', 'clearall'],
        category: 'group',
        async execute(sock, msg, args, { reply, isOwner }) {
            const from = msg.key.remoteJid;
            if (!from.endsWith('@g.us')) return reply('⚠️ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!');

            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                const getNum = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';
                
                const botNum = getNum(sock.user?.id);
                const senderNum = getNum(msg.key.participant || msg.key.remoteJid);

                const botData = participants.find(p => getNum(p.id) === botNum || (p.phoneNumber && getNum(p.phoneNumber) === botNum));
                const senderData = participants.find(p => getNum(p.id) === senderNum || (p.phoneNumber && getNum(p.phoneNumber) === senderNum));

                const isBotAdmin = botData && (botData.admin === 'admin' || botData.admin === 'superadmin');
                
                const isGroupAdmin = senderData && (senderData.admin === 'admin' || senderData.admin === 'superadmin');
                const isAdmin = isGroupAdmin || isOwner; 

                if (!isBotAdmin) return reply('⚠️ ɪ ɴᴇᴇᴅ ᴛᴏ ʙᴇ ᴀɴ ᴀᴅᴍɪɴ ᴛᴏ ᴋɪᴄᴋ ᴍᴇᴍʙᴇʀs!');
                if (!isAdmin) return reply('⚠️ ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ sᴜᴅᴏ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!');

                const usersToKick = participants
                    .filter(p => p.admin !== 'admin' && p.admin !== 'superadmin' && getNum(p.id) !== botNum && getNum(p.id) !== senderNum)
                    .map(p => p.id);

                if (usersToKick.length === 0) return reply('⚠️ ɴᴏ ɴᴏʀᴍᴀʟ ᴍᴇᴍʙᴇʀs ꜰᴏᴜɴᴅ ᴛᴏ ᴋɪᴄᴋ!');

                await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
                await sock.sendMessage(from, { text: '⏳ ᴋɪᴄᴋɪɴɢ ᴀʟʟ ᴍᴇᴍʙᴇʀs ɪɴ 𝟻 sᴇᴄᴏɴᴅs...\n_(ʀᴇsᴛᴀʀᴛ ʙᴏᴛ ᴛᴏ sᴛᴏᴘ)_' }, { quoted: msg });

                await sleep(5000); 

                let kickedCount = 0;
                for (let jid of usersToKick) {
                    try {
                        await sock.groupParticipantsUpdate(from, [jid], 'remove');
                        kickedCount++;
                        await sleep(2500); 
                    } catch (err) {
                        log('KICKALL-ERROR', `Failed to kick ${jid}: ${err.message}`);
                    }
                }

                if (kickedCount > 0) {
                    await sock.sendMessage(from, { text: `✅ ɴᴏʀᴀ ᴋɪᴄᴋᴇᴅ ᴀʟʟ💔` }, { quoted: msg });
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                }

            } catch (e) {
                log('GROUP-KICKALL-FATAL', e.message);
                reply(`❌ ꜰᴀɪʟᴇᴅ ᴛᴏ ᴘʀᴏᴄᴇss ʀᴇǫᴜᴇsᴛ.`);
            }
        }
    },

    // ==========================================
    // 👑 4. PROMOTE COMMAND
    // ==========================================
    {
        command: 'promote',
        aliases: ['makeadmin', 'admin'],
        category: 'group',
        async execute(sock, msg, args, { reply, isOwner }) {
            const from = msg.key.remoteJid;
            if (!from.endsWith('@g.us')) return reply('⚠️ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!');

            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                const getNum = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';
                
                const botNum = getNum(sock.user?.id);
                const senderNum = getNum(msg.key.participant || msg.key.remoteJid);

                const botData = participants.find(p => getNum(p.id) === botNum || (p.phoneNumber && getNum(p.phoneNumber) === botNum));
                const senderData = participants.find(p => getNum(p.id) === senderNum || (p.phoneNumber && getNum(p.phoneNumber) === senderNum));

                const isBotAdmin = botData && (botData.admin === 'admin' || botData.admin === 'superadmin');
                
                const isGroupAdmin = senderData && (senderData.admin === 'admin' || senderData.admin === 'superadmin');
                const isAdmin = isGroupAdmin || isOwner; 

                if (!isBotAdmin) return reply('⚠️ ɪ ɴᴇᴇᴅ ᴛᴏ ʙᴇ ᴀɴ ᴀᴅᴍɪɴ ᴛᴏ ᴘʀᴏᴍᴏᴛᴇ ᴍᴇᴍʙᴇʀs!');
                if (!isAdmin) return reply('⚠️ ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ sᴜᴅᴏ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!');

                let targetUser = null;
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;

                if (quotedMsg && quotedMsg.participant) targetUser = quotedMsg.participant;
                if (quotedMsg && quotedMsg.mentionedJid && quotedMsg.mentionedJid.length > 0) targetUser = quotedMsg.mentionedJid[0];

                if (!targetUser && args.length > 0) {
                    let cleaned = args.join('').replace(/[^0-9]/g, '');
                    if (cleaned.length > 5) targetUser = `${cleaned}@s.whatsapp.net`;
                }

                if (!targetUser) return reply('⚠️ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴜsᴇʀ, ᴍᴇɴᴛɪᴏɴ ᴛʜᴇᴍ, ᴏʀ ᴘʀᴏᴠɪᴅᴇ ᴛʜᴇɪʀ ɴᴜᴍʙᴇ🇷!');

                await sock.groupParticipantsUpdate(from, [targetUser], 'promote');
                const number = targetUser.split('@')[0];
                await sock.sendMessage(from, { text: `✅ ɴᴏʀᴀ ᴘʀᴏᴍᴏᴛᴇᴅ @${number} ᴛᴏ ᴀᴅᴍɪɴ✨`, mentions: [targetUser] }, { quoted: msg });

            } catch (e) {
                log('PROMOTE-FATAL', e.message);
                reply(`❌ ꜰᴀɪʟᴇᴅ ᴛᴏ ᴘʀᴏᴍᴏᴛᴇ.`);
            }
        }
    },

    // ==========================================
    // 📉 5. DEMOTE COMMAND
    // ==========================================
    {
        command: 'demote',
        aliases: ['removeadmin'],
        category: 'group',
        async execute(sock, msg, args, { reply, isOwner }) {
            const from = msg.key.remoteJid;
            if (!from.endsWith('@g.us')) return reply('⚠️ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!');

            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                const getNum = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';
                
                const botNum = getNum(sock.user?.id);
                const senderNum = getNum(msg.key.participant || msg.key.remoteJid);

                const botData = participants.find(p => getNum(p.id) === botNum || (p.phoneNumber && getNum(p.phoneNumber) === botNum));
                const senderData = participants.find(p => getNum(p.id) === senderNum || (p.phoneNumber && getNum(p.phoneNumber) === senderNum));

                const isBotAdmin = botData && (botData.admin === 'admin' || botData.admin === 'superadmin');
                
                const isGroupAdmin = senderData && (senderData.admin === 'admin' || senderData.admin === 'superadmin');
                const isAdmin = isGroupAdmin || isOwner; 

                if (!isBotAdmin) return reply('⚠️ ɪ ɴᴇᴇᴅ ᴛᴏ ʙᴇ ᴀɴ ᴀᴅᴍɪɴ ᴛᴏ ᴅᴇᴍᴏᴛᴇ ᴍᴇᴍʙᴇʀs!');
                if (!isAdmin) return reply('⚠️ ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ sᴜᴅᴏ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!');

                let targetUser = null;
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;

                if (quotedMsg && quotedMsg.participant) targetUser = quotedMsg.participant;
                if (quotedMsg && quotedMsg.mentionedJid && quotedMsg.mentionedJid.length > 0) targetUser = quotedMsg.mentionedJid[0];

                if (!targetUser && args.length > 0) {
                    let cleaned = args.join('').replace(/[^0-9]/g, '');
                    if (cleaned.length > 5) targetUser = `${cleaned}@s.whatsapp.net`;
                }

                if (!targetUser) return reply('⚠️ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴜsᴇʀ, ᴍᴇɴᴛɪᴏɴ ᴛʜᴇᴍ, ᴏʀ ᴘʀᴏᴠɪᴅᴇ ᴛʜᴇɪʀ ɴᴜᴍʙᴇ🇷!');

                await sock.groupParticipantsUpdate(from, [targetUser], 'demote');
                const number = targetUser.split('@')[0];
                await sock.sendMessage(from, { text: `✅ ɴᴏʀᴀ ᴅᴇᴍᴏᴛᴇᴅ @${number}`, mentions: [targetUser] }, { quoted: msg });

            } catch (e) {
                log('DEMOTE-FATAL', e.message);
                reply(`❌ ꜰᴀɪʟᴇᴅ ᴛᴏ ᴅᴇᴍᴏᴛᴇ.`);
            }
        }
    }
];
