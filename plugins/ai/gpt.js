const axios = require('axios');

const log = (step, msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] [${step}] : ${msg}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const MODELS = ['2.3', '4.3', '5.6', '8.8', '12', '98', '33'];

// 🚀 Helper: Fetch with 2 Retries & Random Model Rotation
async function fetchGpt4WithRetry(prompt, retries = 2) {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        const randomModel = MODELS[Math.floor(Math.random() * MODELS.length)];
        const apiURL = `https://kiraxmd-api.onrender.com/api/gpt4?prompt=${encodeURIComponent(prompt)}&model=${randomModel}`;
        
        try {
            log('GPT4-API', `Attempt ${attempt} | Using Model: ${randomModel}`);
            const { data } = await axios.get(apiURL, { timeout: 60000 });
            
            if (data && data.status && data.result) {
                return data.result;
            }
            throw new Error("Invalid API response");
        } catch (err) {
            if (attempt > retries) throw new Error("All models failed after retries.");
            log('GPT4-RETRY', `Model ${randomModel} failed. Retrying with another model... (${attempt}/${retries})`);
            await sleep(1000);
        }
    }
}

module.exports = {
    command: 'chatgpt4',
    aliases: ['gpt', 'gpt4'],
    category: 'ai',
    async execute(sock, msg, args, { reply }) {
        const from = msg.key.remoteJid;
        let query = args.join(' ').trim();
        
        if (!query) {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMsg) {
                query = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
            }
        }

        if (!query) {
            return reply('⚠️ ᴡʜᴀᴛ ᴅᴏ ʏᴏᴜ ᴡᴀɴᴛ ᴛᴏ ᴀsᴋ?\n_ᴇxᴀᴍᴘʟᴇ: .ɢᴘᴛ ᴡʀɪᴛᴇ ᴀɴ ᴇꜱꜱᴀʏ ᴀʙᴏᴜᴛ ɪɴᴅɪᴀ_');
        }

        const shortLog = query.length > 25 ? query.substring(0, 25) + '...' : query;
        log('GPT4-START', `Prompt: ${shortLog}`);
        
        await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } });

        try {
            let aiResponse = await fetchGpt4WithRetry(query, 2);

            log('GPT4-SUCCESS', `Response received! Cleaning tags...`);

            // 🧹 CLEANING RAW TAGS FROM API
            aiResponse = aiResponse
                .replace(/---\s*<Carousel[^>]*>[\s\S]*?<\/Carousel>/gi, '')
                .replace(/<Carousel[^>]*>[\s\S]*?<\/Carousel>/gi, '')
                .replace(/<Image[^>]*>/gi, '')
                .replace(/<ElicitationsGroup[^>]*>[\s\S]*?<\/ElicitationsGroup>/gi, '')
                .replace(/<Elicitation[^>]*>/gi, '')
                .trim();

            await sock.sendMessage(from, { react: { text: '✨', key: msg.key } });
            await sock.sendMessage(from, { text: aiResponse }, { quoted: msg });

        } catch (error) {
            log('GPT4-FATAL', error.message);
            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
            reply(`❌ ᴀɪ ᴇʀʀᴏʀ: ${error.message}`);
        }
    }
};