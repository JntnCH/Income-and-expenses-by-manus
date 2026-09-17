const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  processChatMessage,
  calculateLocalBalanceSummary,
  getRecentTransactions,
  resetLedger
} = require('../services/chatService');
const { processImage } = require('../ocr/ocrManager');
const { resolveCategory } = require('../services/categoryManager');
const { saveRecord, getBalanceSummary } = require('../services/googleSheets');
const { cacheCardPayload } = require('./imageCard');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

/**
 * POST /api/chat/message
 * ส่งข้อความแชทเพื่อบันทึกรายรับ-รายจ่าย หรือถามข้อมูล
 */
router.post('/message', async (req, res) => {
  try {
    const { message, recorder = 'ผู้ใช้แชท', platform = 'Web Chat' } = req.body;
    const response = await processChatMessage(message, { req, recorder, platform });
    res.json(response);
  } catch (error) {
    console.error('[CHAT API ERROR]', error);
    res.status(500).json({
      success: false,
      text: `❌ เกิดข้อผิดพลาดในการประมวลผลแชท: ${error.message}`
    });
  }
});

/**
 * POST /api/chat/upload-slip
 * อัปโหลดภาพสลิปหรือใบเสร็จผ่านช่องแชท
 */
router.post('/upload-slip', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, text: 'กรุณาเลือกไฟล์ภาพสลิป' });
    }

    const ocrResult = await processImage(req.file.buffer);
    const amount = ocrResult.amount || 0;
    const rawItem = ocrResult.item || 'สลิปโอนเงิน / ใบเสร็จ';
    const type = req.body.type || 'รายจ่าย';
    const account = ocrResult.bank || 'สลิปโอนเงิน';

    // คัดกรองและปรับหมวดหมู่ให้แม่นยำ
    const categoryResolution = resolveCategory({
      item: rawItem,
      category: ocrResult.category || 'ทั่วไป',
      type,
      queryText: ocrResult.rawText || rawItem
    });

    const finalCategory = categoryResolution.resolvedCategory;
    const item = (rawItem === 'ใบเสร็จ' && categoryResolution.matchedKeyword) 
      ? categoryResolution.matchedKeyword 
      : rawItem;

    const payload = {
      item,
      type,
      amount,
      category: finalCategory,
      account,
      platform: 'Chat Upload',
      recorder: req.body.recorder || 'ผู้ใช้แชท'
    };

    // บันทึกผ่าน chatService
    const { processChatMessage } = require('../services/chatService');
    const directText = `${type === 'รายรับ' ? 'รายรับ' : 'จ่าย'} ${item} ${amount} บาท ${account}`;
    const result = await processChatMessage(directText, { req, recorder: payload.recorder, platform: 'Slip OCR' });

    res.json({
      success: true,
      text: `🧾 **สแกนสลิปสำเร็จ!**\n\n` +
            `📝 **รายการ:** ${item}\n` +
            `💸 **ยอดเงิน:** **${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท**\n` +
            `🏷️ **หมวดหมู่:** ${finalCategory}\n` +
            `💳 **บัญชี/ธนาคาร:** ${account}\n` +
            `🔍 **OCR Provider:** ${ocrResult.provider || 'Auto'}`,
      cardImageUrl: result.cardImageUrl,
      ocrData: ocrResult,
      transaction: result.data,
      quickReplies: ['เช็คยอดคงเหลือ', 'สแกนอีกรูป', 'กินข้าว 60 บาท']
    });

  } catch (error) {
    console.error('[CHAT SLIP ERROR]', error);
    res.status(500).json({
      success: false,
      text: `❌ ไม่สามารถอ่านสลิปได้: ${error.message}\n(ลองถ่ายภาพให้ชัดเจนขึ้น หรือพิมพ์เป็นข้อความแทนได้นะคะ)`
    });
  }
});

/**
 * GET /api/chat/balance
 * ดึงสรุปยอดและรูปการ์ด
 */
router.get('/balance', async (req, res) => {
  try {
    let summary;
    try {
      if (process.env.GOOGLE_SPREADSHEET_ID) {
        summary = await getBalanceSummary();
      }
    } catch (e) {
      // fallback
    }

    if (!summary) {
      summary = calculateLocalBalanceSummary();
    }

    let cardUrl = null;
    try {
      cardUrl = cacheCardPayload('balance', summary, req);
    } catch (e) {
      console.warn('[BALANCE CARD WARN]', e.message);
    }

    res.json({
      success: true,
      summary,
      cardImageUrl: cardUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/recent
 * ประวัติรายการบันทึกล่าสุด
 */
router.get('/recent', (req, res) => {
  const transactions = getRecentTransactions(30);
  res.json({ success: true, transactions });
});

/**
 * POST /api/chat/reset
 * ล้างข้อมูลจำลอง
 */
router.post('/reset', (req, res) => {
  const result = resetLedger();
  res.json(result);
});

module.exports = router;
