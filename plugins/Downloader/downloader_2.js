const axios = require('axios');

const log = (step, msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] [${step}] : ${msg}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🚀 Helper for 2 Retries (API & Buffer) - For Spotify & TikTok
async function fetchJsonWithRetry(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const { data } = await axios.get(url, { timeout: 20000 });
            if (data && (data.status || data.status === 'success')) return data;
            throw new Error("Invalid API response");
        } catch (err) {
            if (i === retries) throw err;
            log('DL-RETRY', `API failed. Retrying... (${i + 1}/${retries})`);
            await sleep(1000); 
        }
    }
}

async function fetchBufferWithRetry(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await axios.get(url, {
                responseType: "arraybuffer", 
                timeout: 45000, 
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
            });
            if (res.status === 200 && res.data) return Buffer.from(res.data);
            throw new Error("Invalid Buffer");
        } catch (err) {
            if (i === retries) throw err;
            log('DL-RETRY', `Download failed. Retrying... (${i + 1}/${retries})`);
            await sleep(1500); 
        }
    }
}


module.exports = [
    // ==========================================
    // 📦 1. TERABOX DOWNLOADER
    // ==========================================
    {
        command: 'terabox',
        aliases: ['tb', 'tbdl', 'tera'],
        category: 'downloader',
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

            if (!query || (!query.includes('terabox') && !query.includes('1024terabox'))) {
                return reply('⚠️ *Provide a valid Terabox URL!*');
            }

            log('TB-START', `Requested Terabox URL: ${query}`);
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            try {
                log('TB-API', `Requesting Kira Terabox API...`);
                const apiURL = `https://kiraxmd-api.onrender.com/api/terabox?url=${encodeURIComponent(query)}`;
                const { data } = await axios.get(apiURL, { timeout: 30000 });

                if (!data || data.status !== 'success' || !data.url) {
                    throw new Error("Could not fetch the Terabox media. Link might be dead or private.");
                }

                const downloadUrl = data.url;
                const fileName = data.title || 'Terabox_File.mp4';
                
                const tbCaption = `*◈ ɴᴏʀᴀ ᴛᴇʀᴀʙᴏx ᴍᴇᴅɪᴀ*\n*⚡ ʜᴅ ᴅᴏᴡɴʟᴏᴀᴅ ✓*`;

                log('TB-API', `Found link: ${fileName}. Downloading to ArrayBuffer...`);

                const res = await axios.get(downloadUrl, {
                    responseType: "arraybuffer", 
                    timeout: 300000, 
                    maxContentLength: 800 * 1024 * 1024,
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
                });

                if (res.status === 200 && res.data) {
                    const mediaBuffer = Buffer.from(res.data);
                    const sizeInMB = mediaBuffer.length / (1024 * 1024);
                    const contentType = res.headers['content-type'] || '';
                    
                    log('TB-UPLOAD', `Buffer Ready | Size: ${sizeInMB.toFixed(2)} MB`);

                    if (sizeInMB > 50 || (!contentType.includes('video') && !contentType.includes('image'))) {
                        await sock.sendMessage(from, { 
                            document: mediaBuffer, 
                            mimetype: contentType || "application/octet-stream", 
                            fileName: fileName,
                            caption: `📄 *sᴇɴᴛ ᴀs ᴅᴏᴄᴜᴍᴇɴᴛ (${sizeInMB.toFixed(1)}ᴍʙ)*\n\n` + tbCaption + (footerText || '')
                        }, { quoted: msg });
                    } else if (contentType.includes('video') || fileName.endsWith('.mp4')) {
                        await sock.sendMessage(from, { 
                            video: mediaBuffer, 
                            caption: tbCaption + (footerText || '')
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { 
                            image: mediaBuffer, 
                            caption: tbCaption + (footerText || '')
                        }, { quoted: msg });
                    }

                    log('TB-SUCCESS', `Terabox media delivered!`);
                    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                }
            } catch (e) {
                log('TB-FATAL', e.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${e.message}` + (footerText || '') }, { quoted: msg });
            }
        }
    },

    // ==========================================
    // 🎵 2. SPOTIFY DOWNLOADER (Clean Audio)
    // ==========================================
    {
        command: 'spotify',
        aliases: ['spdl', 'spotifydl', 'spsong'],
        category: 'downloader',
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

            if (!query) return reply('⚠️ *Provide a Spotify Song Name or URL!*');

            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            try {
                let spotifyUrl = query;
                
                if (!query.includes('spotify.com')) {
                    const searchApi = `https://kiraxmd-api.onrender.com/api/spotifysearch?q=${encodeURIComponent(query)}&limit=1`;
                    const searchData = await fetchJsonWithRetry(searchApi, 2); 
                    
                    if (!searchData.result || searchData.result.length === 0) throw new Error("Song not found.");
                    spotifyUrl = searchData.result[0].spotify_url;
                }

                const dlApi = `https://kiraxmd-api.onrender.com/api/spotify?url=${encodeURIComponent(spotifyUrl)}`;
                const dlData = await fetchJsonWithRetry(dlApi, 2); 

                if (!dlData.result || !dlData.result.mp3) throw new Error("Could not extract download link.");

                const { title, mp3 } = dlData.result;
                
                try {
                    const audioBuffer = await fetchBufferWithRetry(mp3, 2);
                    await sock.sendMessage(from, { 
                        audio: audioBuffer, 
                        mimetype: 'audio/mpeg',
                        ptt: false,
                        fileName: `${title}.mp3`
                    }, { quoted: msg });
                } catch (bufferError) {
                    await sock.sendMessage(from, { 
                        audio: { url: mp3 }, 
                        mimetype: 'audio/mpeg',
                        ptt: false,
                        fileName: `${title}.mp3`
                    }, { quoted: msg });
                }

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } catch (error) {
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${error.message}` + (footerText || '') }, { quoted: msg });
            }
        }
    },

    // ==========================================
    // 🎬 3. TIKTOK DOWNLOADER (Video Only)
    // ==========================================
    {
        command: 'tiktok',
        aliases: ['tt', 'tik', 'ttdl'],
        category: 'downloader',
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

            if (!query || !query.includes('tiktok.com')) {
                return reply('⚠️ *Provide a valid TikTok URL!*');
            }

            log('TIKTOK-START', `Requested TikTok URL: ${query}`);
            await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            try {
                const apiURL = `https://kiraxmd-api.onrender.com/api/tiktok?url=${encodeURIComponent(query)}`;
                const data = await fetchJsonWithRetry(apiURL, 2);

                if (!data || !data.status || !data.result) {
                    throw new Error("Could not fetch the TikTok video. Ensure the link is valid.");
                }

                const res = data.result;
                const ttCaption = `*◈ ɴᴏʀᴀ ᴛɪᴋᴛᴏᴋ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n*⚡ ʜᴅ ᴅᴏᴡɴʟᴏᴀᴅ ✓*`;

                // Send Video Only
                await sock.sendMessage(from, { 
                    video: { url: res.video_url }, 
                    caption: ttCaption + footerText 
                }, { quoted: msg });

                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } catch (e) {
                log('TIKTOK-FATAL', e.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${e.message}` + footerText }, { quoted: msg });
            }
        }
    },

// ==========================================
    // 🐦 TWITTER / X DOWNLOADER (Zero-RAM Method: Direct URL Stream)
    // ==========================================
    {
        command: 'twitter',
        aliases: ['tw', 'twdl', 'x'],
        category: 'downloader',
        async execute(sock, msg, args, { reply, footerText }) {
            const from = msg.key.remoteJid;
            let query = args.join(' ').trim();
            
            if (!query) {
                const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMsg) {
                    query = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
                    const match = query.match(/https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^\s]+/);
                    if (match) query = match[0];
                }
            }

            if (!query || (!query.includes('twitter.com') && !query.includes('x.com'))) {
                return reply('⚠️ *Provide a valid Twitter/X URL!*');
            }

            log('TWITTER-START', `Requested URL: ${query}`);
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            try {
                const apiURL = `https://kiraxmd-api.onrender.com/api/twitter?url=${encodeURIComponent(query)}`;
                let videoUrl = null;
                
                log('TWITTER-API', `Fetching from Kira X MD API...`);
                
                // 🔄 1. API Fetch - 3 Retries
                for (let i = 1; i <= 3; i++) {
                    try {
                        const { data } = await axios.get(apiURL, { timeout: 15000 });
                        
                        if (data && data.status && data.result && data.result.video_url) {
                            videoUrl = data.result.video_url;
                            log('TWITTER-API', `Successfully fetched video URL.`);
                            break; 
                        }
                        throw new Error("Invalid response format");
                    } catch (err) {
                        if (i === 3) throw new Error("API failed after 3 retries. Link might be invalid.");
                        log('TWITTER-RETRY', `API fetch failed. Retrying... (${i}/3)`);
                        await new Promise(r => setTimeout(r, 1000)); 
                    }
                }

                if (!videoUrl) throw new Error("Could not extract video link.");

                let sizeInMB = 0;
                log('TWITTER-DL', `Fetching file size (Without downloading)...`);

                // 🚀 GET FILE SIZE WITHOUT DOWNLOADING (Using HEAD request)
                try {
                    const headRes = await axios.head(videoUrl);
                    const contentLength = headRes.headers['content-length'];
                    if (contentLength) {
                        sizeInMB = parseInt(contentLength) / (1024 * 1024);
                    }
                } catch (e) {
                    log('TWITTER-WARN', `Could not fetch exact size. Defaulting to normal upload.`);
                }

                const twCaption = `*◈ ɴᴏʀᴀ ᴛᴡɪᴛᴛᴇʀ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n*⚡ ʜᴅ ᴅᴏᴡɴʟᴏᴀᴅ ✓*`;

                // 🚀 SMART UPLOAD (Direct URL passing - Zero RAM usage)
                if (sizeInMB > 50) {
                    log('TWITTER-UPLOAD', `Size: ${sizeInMB.toFixed(2)} MB (>50MB). Streaming as Document...`);
                    await sock.sendMessage(from, {
                        document: { url: videoUrl }, // Direct URL സ്ട്രീമിംഗ്
                        mimetype: "video/mp4",
                        fileName: "Twitter_Video.mp4",
                        caption: `📄 *sᴇɴᴛ ᴀs ᴅᴏᴄᴜᴍᴇɴᴛ (${sizeInMB.toFixed(1)}ᴍʙ)*\n\n` + twCaption + (footerText ? `\n\n${footerText}` : '')
                    }, { quoted: msg });
                } else {
                    log('TWITTER-UPLOAD', `Size: ${sizeInMB.toFixed(2)} MB (<50MB). Streaming as normal Video...`);
                    await sock.sendMessage(from, {
                        video: { url: videoUrl }, // Direct URL സ്ട്രീമിംഗ്
                        caption: twCaption + (footerText ? `\n\n${footerText}` : '')
                    }, { quoted: msg });
                }

                log('TWITTER-SUCCESS', `Media delivered successfully.`);
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } catch (e) {
                log('TWITTER-FATAL', e.message);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, { text: `❌ *ꜰᴀɪʟᴇᴅ:* ${e.message}\n\n${footerText || ''}` }, { quoted: msg });
            }
        }
    }
 ];