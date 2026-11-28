require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// 🚀 DEFAULT PREFIX IS DOT (.)
const defaultSettings = {
    botName: process.env.BOT_NAME || 'Nora x md',
    prefix: ['.'], 
    ownerName: 'madhav',
    menuImage: 'https://files.catbox.moe/wvupj3.png',
    antiLink: false,
    antiSpam: false
};

if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));

const getSettings = () => {
    try { 
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); 
    } catch { 
        return defaultSettings; 
    }
};

module.exports = {
    sessionId: process.env.SESSION_ID || '', 
    ownerNumber: (process.env.OWNER_NUMBER || '910000000000').replace(/[^0-9]/g, ''),
    sessionPrefix: process.env.SESSION_ID_PREFIX || 'Nora~',
    settings: getSettings(),
    
    saveSettings: (newSettings) => {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2));
    },
    saveUser: (userNumber) => {
        try {
            let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
            if (!users.includes(userNumber)) {
                users.push(userNumber);
                fs.writeFileSync(USERS_FILE, JSON.stringify(users));
            }
        } catch (e) {}
    },
    getTotalUsers: () => {
        try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')).length; } 
        catch { return 0; }
    }
};