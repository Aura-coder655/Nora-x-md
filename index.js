const http = require('http');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');
const config = require('./config');
const messageHandler = require('./handlers');

// 🌐 Browser Test + Render Port Binding
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    // 1. Search & TV Login Status Check
    if (parsedUrl.pathname === '/test-yt') {
        const q = parsedUrl.searchParams.get('q') || 'arz kiya';
        try {
            const results = await ytEngine.searchYoutube(q, 3);
            const loggedIn = await ytEngine.isLoggedIn();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: true, tvLoggedIn: loggedIn, results }, null, 2));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: false, error: err.message }, null, 2));
        }
    }

    // 2. Direct Audio Stream/Download Check
    if (parsedUrl.pathname === '/test-audio') {
        const q = parsedUrl.searchParams.get('q') || 'arz kiya';
        let filePath = null;
        try {
            let url = ytEngine.youtubeUrlFrom(q);
            if (!url) {
                const results = await ytEngine.searchYoutube(q, 1);
                if (!results.length) throw new Error('No results found');
                url = results[0].url;
            }
            const aud = await ytEngine.downloadAudio(url);
            filePath = aud.path;
            const stat = await fs.stat(filePath);

            res.writeHead(200, {
                'Content-Type': aud.mimetype,
                'Content-Length': stat.size,
                'Content-Disposition': `inline; filename="${aud.title}.${aud.ext}"`
            });
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            stream.on('close', () => ytEngine.cleanup(filePath));
            return;
        } catch (err) {
            await ytEngine.cleanup(filePath);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: false, error: err.message }, null, 2));
        }
    }

    // 3. Direct Video Stream/Download Check
    if (parsedUrl.pathname === '/test-video') {
        const q = parsedUrl.searchParams.get('q') || 'arz kiya';
        const quality = parsedUrl.searchParams.get('quality') || '360p';
        let filePath = null;
        try {
            let url = ytEngine.youtubeUrlFrom(q);
            if (!url) {
                const results = await ytEngine.searchYoutube(q, 1);
                if (!results.length) throw new Error('No results found');
                url = results[0].url;
            }
            const vid = await ytEngine.downloadVideo(url, quality);
            filePath = vid.path;
            const stat = await fs.stat(filePath);

            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': stat.size,
                'Content-Disposition': `inline; filename="${vid.title}.mp4"`
            });
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            stream.on('close', () => ytEngine.cleanup(filePath));
            return;
        } catch (err) {
            await ytEngine.cleanup(filePath);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ status: false, error: err.message }, null, 2));
        }
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('NORA X MD is Running!\n');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP Server listening on port ${PORT}`);
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://achuttan629_db_user:Achu2009@cluster0.w2kou92.mongodb.net/NoraBot?retryWrites=true&w=majority';

async function restoreSession() {
    const sessionDir = path.join(__dirname, 'session_auth_info');
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath) && config.sessionId) {
        try {
            console.log(`⏳ Fetching Session data for [${config.sessionId}] from Database...`);
            await mongoose.connect(MONGO_URI);
            
            const SessionModel = mongoose.models.Session || mongoose.model('Session', new mongoose.Schema({
                sessionId: String,
                sessionData: Object
            }));

            const session = await SessionModel.findOne({ sessionId: config.sessionId });
            
            if (session && session.sessionData) {
                fs.writeFileSync(credsPath, JSON.stringify(session.sessionData));
                console.log('✅ Session restored successfully from Database!');
            } else {
                console.log('❌ Session ID not found in Database. Please generate a new Pairing Code.');
            }
            await mongoose.disconnect();
        } catch (err) {
            console.error('❌ Database Error:', err.message);
        }
    }
}

async function startBot() {
    await restoreSession();

    const { state, saveCreds } = await useMultiFileAuthState('session_auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: true 
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            if (config.ownerNumber && config.ownerNumber !== '910000000000') {
                try {
                    const code = await sock.requestPairingCode(config.ownerNumber);
                    console.log(`\n====================================`);
                    console.log(`[ 🔥 PAIRING CODE ] : ${code?.match(/.{1,4}/g)?.join('-')}`);
                    console.log(`====================================\n`);
                } catch (error) {}
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 500) {
                console.log('\n❌ You logged out. Please change the session id.');
                console.log('⚠️ Please change your session id if you face any error in bot.\n');
                
                try {
                    fs.rmSync(path.join(__dirname, 'session_auth_info'), { recursive: true, force: true });
                    console.log('🗑️ Bad session deleted. Restart panel to pair again.');
                    process.exit(0);
                } catch (e) {}
            } else {
                console.log(`🔄 Reconnecting...`);
                startBot();
            }
        } else if (connection === 'open') {
            const botName = config.settings?.botName || 'NORA X MD';
            
            console.log(`\n====================================`);
            console.log(`🚀 Welcome to ${botName}`);
            console.log(`✅ You successfully connected!`);
            console.log(`====================================\n`);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            await messageHandler(sock, chatUpdate);
        } catch (err) {
            console.error('❌ Handler Error:', err.message);
        }
    });
}

startBot();