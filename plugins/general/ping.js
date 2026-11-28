module.exports = {
  command: 'ping',
  aliases: ['speed', 'latency'],
  category: 'general',
  execute: async (sock, msg, args, { from }) => {
    const pingMsg = await sock.sendMessage(from, { text: '⏳ Pinging...' }, { quoted: msg });

    const start = msg.messageTimestamp?.low
      ? msg.messageTimestamp.low * 1000
      : msg.messageTimestamp * 1000;
    const ping = Date.now() - start;

    await sock.sendMessage(from, {
      text: `🚀 *Pong!* 🏓\n\n⚡ Speed: ${ping}ms`,
      edit: pingMsg.key
    });
  }
};