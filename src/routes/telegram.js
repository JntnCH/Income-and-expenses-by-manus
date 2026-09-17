/**
 * Telegram Webhook & Management Routes
 * จัดการ Webhook และการตั้งค่า Telegram Bot
 */

const express = require('express');
const router = express.Router();
const {
  getTelegramConfig,
  saveTelegramConfig,
  getMe,
  getWebhookInfo,
  setWebhook,
  deleteWebhook,
  sendMessage,
  processTelegramUpdate
} = require('../services/telegramService');

/**
 * POST /webhook/telegram or /telegram/webhook or /webhook
 * รับข้อความและเหตุการณ์จาก Telegram Server
 */
router.post(['/telegram', '/webhook', '/'], async (req, res) => {
  // ตอบรับ Telegram 200 OK ทันทีตาม Best Practice ของ Telegram Webhook
  res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (update && (update.message || update.callback_query)) {
      await processTelegramUpdate(update, req);
    }
  } catch (error) {
    console.error('[TELEGRAM WEBHOOK ERROR]', error);
  }
});

/**
 * GET /api/telegram/status
 * ตรวจสอบสถานะการเชื่อมต่อ Bot และ Webhook
 */
router.get('/status', async (req, res) => {
  const config = getTelegramConfig();
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  const detectedWebhookUrl = `${protocol}://${host}/webhook/telegram`;

  let botInfo = null;
  let webhookInfo = null;
  let botError = null;

  if (config.token) {
    try {
      botInfo = await getMe();
      webhookInfo = await getWebhookInfo();
    } catch (e) {
      botError = e.message;
    }
  }

  // Masking token เพื่อความปลอดภัย
  let maskedToken = '';
  if (config.token) {
    const parts = config.token.split(':');
    if (parts.length === 2) {
      maskedToken = `${parts[0]}:` + parts[1].substring(0, 4) + '...' + parts[1].substring(parts[1].length - 4);
    } else {
      maskedToken = config.token.substring(0, 4) + '...' + config.token.substring(config.token.length - 4);
    }
  }

  res.json({
    success: true,
    configured: config.enabled,
    hasToken: !!config.token,
    ready: !!(botInfo && (webhookInfo?.url || config.webhookUrl)),
    maskedToken,
    tokenMasked: maskedToken,
    defaultChatId: config.defaultChatId,
    webhookUrl: config.webhookUrl || webhookInfo?.url || '',
    detectedWebhookUrl,
    botInfo,
    bot: botInfo,
    webhookInfo,
    webhook: webhookInfo,
    botError
  });
});

/**
 * POST /api/telegram/save-config
 * บันทึก Bot Token และ Default Chat ID
 */
router.post('/save-config', async (req, res) => {
  try {
    const { token, defaultChatId } = req.body;
    const updated = saveTelegramConfig({ token, defaultChatId });

    let botInfo = null;
    let error = null;
    if (updated.token) {
      try {
        botInfo = await getMe(updated.token);
      } catch (e) {
        error = e.message;
      }
    }

    res.json({
      success: true,
      botInfo,
      error,
      message: error 
        ? `บันทึกแล้ว แต่ตรวจพบข้อผิดพลาดจาก Telegram API: ${error}` 
        : `เชื่อมต่อ Telegram Bot @${botInfo?.username || 'Bot'} สำเร็จ!`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/telegram/set-webhook
 * ลงทะเบียน Webhook URL อัตโนมัติ
 */
router.post('/set-webhook', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const defaultUrl = `${protocol}://${host}/webhook/telegram`;

    const targetUrl = req.body.webhookUrl || req.body.url || defaultUrl;
    const result = await setWebhook(targetUrl);
    const webhookInfo = await getWebhookInfo();

    res.json({
      success: true,
      targetUrl,
      result,
      webhookInfo,
      message: `ลงทะเบียน Telegram Webhook ไปที่ ${targetUrl} เรียบร้อยแล้ว!`
    });
  } catch (err) {
    console.error('[SET WEBHOOK ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/telegram/delete-webhook
 * ลบ Webhook
 */
router.post('/delete-webhook', async (req, res) => {
  try {
    const result = await deleteWebhook();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/telegram/test-message
 * ทดสอบส่งข้อความไปยัง Telegram Chat
 */
router.post('/test-message', async (req, res) => {
  try {
    const config = getTelegramConfig();
    const chatId = req.body.chatId || config.defaultChatId;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ Chat ID สำหรับทดสอบ (หรือตั้งค่าในระบบก่อน)'
      });
    }

    const text = req.body.text || (
      `🔔 *ทดสอบการเชื่อมต่อระบบ DevMus Telegram Bot*\n\n` +
      `✅ บอทเชื่อมต่อกับเซิร์ฟเวอร์เรียบร้อยแล้ว!\n` +
      `🕒 เวลาทดสอบ: ${new Date().toLocaleString('th-TH')}\n\n` +
      `ลองพิมพ์ข้อความ เช่น \`กินข้าว 60\` หรือ \`เช็คยอด\` เพื่อเริ่มต้นใช้งานได้เลยครับ 🚀`
    );

    const result = await sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 เช็คยอดคงเหลือ', callback_data: 'action:balance' }],
          [{ text: '🕒 ดูประวัติล่าสุด', callback_data: 'action:recent' }]
        ]
      }
    });

    res.json({
      success: true,
      chatId,
      result,
      message: `ส่งข้อความทดสอบไปยัง Chat ID ${chatId} สำเร็จ!`
    });
  } catch (err) {
    console.error('[TEST MESSAGE ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/telegram/simulate
 * จำลองการรับส่งข้อความเหมือน Telegram เพื่อให้ทดสอบได้ทันทีในหน้าเว็บ
 */
router.post('/simulate', async (req, res) => {
  try {
    const { text, type = 'text', userName = 'ผู้ใช้ทดสอบ' } = req.body;
    const { processChatMessage } = require('../services/chatService');
    const { cacheCardPayload } = require('./imageCard');

    let result = null;
    let cardUrl = null;

    if (text === '/start') {
      const { getMainInlineKeyboard } = require('../services/telegramService');
      return res.json({
        success: true,
        type: 'text',
        response: `👋 สวัสดีครับคุณ ${userName}! ยินดีต้อนรับสู่ระบบบันทึกบัญชีอัจฉริยะ DevMus Assistant บน Telegram`,
        inlineKeyboard: getMainInlineKeyboard()
      });
    }

    if (text === '/balance' || text === 'เช็คยอด') {
      const { calculateLocalBalanceSummary } = require('../services/chatService');
      const summary = calculateLocalBalanceSummary();
      cardUrl = cacheCardPayload('balance', summary, req);
      return res.json({
        success: true,
        type: 'balance',
        response: `📊 สรุปยอดเงินคงเหลือสุทธิ: ${Number(summary.balance).toLocaleString()} บาท`,
        summary,
        cardImageUrl: cardUrl
      });
    }

    // ประมวลผลข้อความทั่วไป
    result = await processChatMessage(text, {
      req,
      recorder: userName,
      platform: 'Telegram Simulator'
    });

    res.json({
      success: true,
      type: 'transaction',
      response: result.text,
      cardImageUrl: result.cardImageUrl,
      data: result.data
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
