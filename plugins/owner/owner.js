const log = (step, msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] [${step}] : ${msg}`);
};

module.exports = [
    // ==========================================
    // 🚫 1. BAN COMMAND 
    // ==========================================
    {
        command: 'ban',
        aliases: ['botban'],
        category: 'owner',
        async execute(sock, msg, args, { reply, isOwner, senderNumber }) {
            if (!isOwner && !global.sudoUsers.includes(senderNumber)) return reply('⚠️ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ɪs ᴏɴʟʏ ꜰᴏʀ ᴛʜᴇ ᴏᴡɴᴇʀ ᴏʀ sᴜᴅᴏ!');

            let targetNum = null;
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;

            if (quotedMsg && quotedMsg.participant) targetNum = quotedMsg.participant.split('@')[0].split(':')[0];
            else if (quotedMsg && quotedMsg.mentionedJid && quotedMsg.mentionedJid.length > 0) targetNum = quotedMsg.mentionedJid[0].split('@')[0].split(':')[0];
            else if (args.length > 0) targetNum = args.join('').replace(/[^0-9]/g, '');

            if (!targetNum || targetNum.length < 5) return reply('⚠️ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠᴀʟɪᴅ ᴜsᴇʀ ᴛᴏ ʙᴀɴ');
            if (isOwner && targetNum === senderNumber) return reply('⚠️ ʏᴏᴜ ᴄᴀɴɴᴏᴛ ʙᴀɴ ʏᴏᴜʀsᴇʟꜰ!');
            if (global.bannedUsers.includes(targetNum)) return reply(`ℹ️ @${targetNum} ɪs ᴀʟʀᴇᴀᴅʏ ʙᴀɴɴᴇᴅ!`);

            global.bannedUsers.push(targetNum);
            global.saveDB(); // 💾 Saves to JSON automatically

            log('BOT-BAN', `User banned: ${targetNum}`);
            await sock.sendMessage(msg.key.remoteJid, { text: `✅ ɴᴏʀᴀ ʙᴀɴɴᴇᴅ @${targetNum} sᴜᴄᴄᴇssꜰᴜʟʟʏ!`, mentions: [`${targetNum}@s.whatsapp.net`] }, { quoted: msg });
        }
    },

    // ==========================================
    // ✨ 2. UNBAN COMMAND
    // ==========================================
    {
        command: 'unban',
        aliases: ['botunban'],
        category: 'owner',
        async execute(sock, msg, args, { reply, isOwner, senderNumber }) {
            if (!isOwner && !global.sudoUsers.includes(senderNumber)) return reply('⚠️ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ɪs ᴏɴʟʏ ꜰᴏʀ ᴛʜᴇ ᴏᴡɴᴇʀ ᴏʀ sᴜᴅᴏ!');

            let targetNum = null;
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;

            if (quotedMsg && quotedMsg.participant) targetNum = quotedMsg.participant.split('@')[0].split(':')[0];
            else if (quotedMsg && quotedMsg.mentionedJid && quotedMsg.mentionedJid.length > 0) targetNum = quotedMsg.mentionedJid[0].split('@')[0].split(':')[0];
            else if (args.length > 0) targetNum = args.join('').replace(/[^0-9]/g, '');

            if (!targetNum) return reply('⚠️ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠᴀʟɪᴅ ᴜsᴇʀ ᴛᴏ ᴜɴʙᴀɴ!');

            const index = global.bannedUsers.indexOf(targetNum);
            if (index > -1) {
                global.bannedUsers.splice(index, 1);
                global.saveDB(); // 💾 Saves to JSON automatically
                
                log('BOT-UNBAN', `User unbanned: ${targetNum}`);
                await sock.sendMessage(msg.key.remoteJid, { text: `✅ ɴᴏʀᴀ ᴜɴʙᴀɴɴᴇᴅ @${targetNum} sᴜᴄᴄᴇssꜰᴜʟʟʏ!`, mentions: [`${targetNum}@s.whatsapp.net`] }, { quoted: msg });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: `ℹ️ @${targetNum} ɪs ɴᴏᴛ ɪɴ ᴛʜᴇ ʙᴀɴɴᴇᴅ ʟɪsᴛ.`, mentions: [`${targetNum}@s.whatsapp.net`] }, { quoted: msg });
            }
        }
    },

    // ==========================================
    // 👑 3. ADD SUDO
    // ==========================================
    {
        command: 'addsudo',
        category: 'owner',
        async execute(sock, msg, args, { reply, isOwner }) {
            if (!isOwner) return reply('⚠️ ᴏɴʟʏ ᴛʜᴇ ᴍᴀɪɴ ᴏᴡɴᴇʀ ᴄᴀɴ ᴜsᴇ ᴛʜɪs!');
            
            let targetNum = null;
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;

            if (quotedMsg && quotedMsg.participant) targetNum = quotedMsg.participant.split('@')[0].split(':')[0];
            else if (quotedMsg && quotedMsg.mentionedJid && quotedMsg.mentionedJid.length > 0) targetNum = quotedMsg.mentionedJid[0].split('@')[0].split(':')[0];
            else if (args.length > 0) targetNum = args.join('').replace(/[^0-9]/g, '');

            if (!targetNum || targetNum.length < 5) return reply('⚠️ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠᴀʟɪᴅ ᴜsᴇʀ!');
            if (global.sudoUsers.includes(targetNum)) return reply('ℹ️ ᴜsᴇʀ ɪs ᴀʟʀᴇᴀᴅʏ ᴀ sᴜᴅᴏ!');

            global.sudoUsers.push(targetNum);
            global.saveDB(); // 💾 Saves to JSON automatically

            log('SUDO-ADD', `Added: ${targetNum}`);
            await sock.sendMessage(msg.key.remoteJid, { text: `✅ ɴᴏʀᴀ ᴀᴅᴅᴇᴅ @${targetNum} ᴀs sᴜᴅᴏ!`, mentions: [`${targetNum}@s.whatsapp.net`] }, { quoted: msg });
        }
    },

    // ==========================================
    // 🗑️ 4. DEL SUDO
    // ==========================================
    {
        command: 'delsudo',
        category: 'owner',
        async execute(sock, msg, args, { reply, isOwner }) {
            if (!isOwner) return reply('⚠️ ᴏɴʟʏ ᴛʜᴇ ᴍᴀɪɴ ᴏᴡɴᴇʀ ᴄᴀɴ ᴜsᴇ ᴛʜɪs!');
            
            let targetNum = null;
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;

            if (quotedMsg && quotedMsg.participant) targetNum = quotedMsg.participant.split('@')[0].split(':')[0];
            else if (quotedMsg && quotedMsg.mentionedJid && quotedMsg.mentionedJid.length > 0) targetNum = quotedMsg.mentionedJid[0].split('@')[0].split(':')[0];
            else if (args.length > 0) targetNum = args.join('').replace(/[^0-9]/g, '');

            if (!targetNum) return reply('⚠️ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠᴀʟɪᴅ ᴜsᴇʀ!');

            const index = global.sudoUsers.indexOf(targetNum);
            if (index > -1) {
                global.sudoUsers.splice(index, 1);
                global.saveDB(); // 💾 Saves to JSON automatically

                log('SUDO-DEL', `Removed: ${targetNum}`);
                await sock.sendMessage(msg.key.remoteJid, { text: `✅ ɴᴏʀᴀ ʀᴇᴍᴏᴠᴇᴅ @${targetNum} ꜰʀᴏᴍ sᴜᴅᴏ!`, mentions: [`${targetNum}@s.whatsapp.net`] }, { quoted: msg });
            } else {
                reply(`ℹ️ ᴜsᴇʀ ɪs ɴᴏᴛ ᴀ sᴜᴅᴏ.`);
            }
        }
    },

    // ==========================================
    // 📋 5. LIST SUDO
    // ==========================================
    {
        command: 'listsudo',
        category: 'owner',
        async execute(sock, msg, args, { reply, isOwner, senderNumber }) {
            if (!isOwner && !global.sudoUsers.includes(senderNumber)) return reply('⚠️ ᴏɴʟʏ ᴏᴡɴᴇʀ/sᴜᴅᴏ ᴄᴀɴ ᴜsᴇ ᴛʜɪs!');
            if (global.sudoUsers.length === 0) return reply('ℹ️ ɴᴏ sᴜᴅᴏ ᴜsᴇʀs ꜰᴏᴜɴᴅ.');

            let listMsg = `*◈ ɴᴏʀᴀ sᴜᴅᴏ ʟɪsᴛ ◈*\n\n`;
            let mentions = [];
            
            global.sudoUsers.forEach((num, i) => {
                listMsg += `${i + 1}. @${num}\n`;
                mentions.push(`${num}@s.whatsapp.net`);
            });

            await sock.sendMessage(msg.key.remoteJid, { text: listMsg.trim(), mentions }, { quoted: msg });
        }
    }
];
