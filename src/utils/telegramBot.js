/**
 * Telegram Bot Helper
 * ใช้ส่งรูปภาพสลิปผ่าน Telegram Bot API โดยตรง
 * (กรณีไม่ใช้ Dialogflow Telegram Integration)
 * 
 * ติดตั้ง: npm install node-telegram-bot-api
 */

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (token) {
  bot = new TelegramBot(token, { polling: false }); // ไม่ต้อง polling ถ้าใช้ webhook
}

/**
 * ส่งรูปภาพสลิปไปยัง Telegram Chat
 * @param {string} chatId - Telegram Chat ID
 * @param {string} imagePath - พาธไฟล์รูปภาพ
 * @param {string} caption - ข้อความกำกับ (optional)
 */
async function sendReceiptPhoto(chatId, imagePath, caption = '') {
  if (!bot) {
    throw new Error('TELEGRAM_BOT_TOKEN ไม่ได้ตั้งค่าใน .env');
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`ไม่พบไฟล์รูปภาพ: ${imagePath}`);
  }

  try {
    await bot.sendPhoto(chatId, imagePath, {
      caption: caption,
      parse_mode: 'HTML'
    });
    console.log(`[TELEGRAM] ส่งรูปสำเร็จไปยัง Chat ${chatId}`);
  } catch (err) {
    console.error('[TELEGRAM ERROR]', err.message);
    throw err;
  }
}

/**
 * ส่งข้อความธรรมดา (fallback)
 */
async function sendTextMessage(chatId, text) {
  if (!bot) return;
  await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

module.exports = {
  sendReceiptPhoto,
  sendTextMessage,
  getBot: () => bot
};
