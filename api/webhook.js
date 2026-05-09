const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const msg = req.body.message;
    if (msg && msg.text) {
      const chatId = msg.chat.id;
      const text = msg.text;
      console.log(`[SIMPLIFIED LOG] Message from ${chatId}: ${text}`);
      
      // Apapun yang diketik user, bot hanya akan menjawab ini
      await bot.sendMessage(chatId, `Halo! Saya bot versi minimalis. Saya menerima pesan Anda: ${text}`);
    }
  }
  res.status(200).send('OK');
};
