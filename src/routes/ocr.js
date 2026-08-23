const express = require('express');
const router = express.Router();
const multer = require('multer');
const { processImage, getAvailableProviders } = require('../ocr/ocrManager');
const { saveRecord } = require('../services/googleSheets');
const { buildDialogflowResponse, buildOCRConfirmation } = require('../utils/responseBuilder');

// ตั้งค่า multer สำหรับรับไฟล์ภาพ (เก็บใน memory ไม่บันทึกลง disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('รองรับเฉพาะไฟล์ภาพ JPEG, PNG, HEIC เท่านั้น'));
    }
  }
});

/**
 * POST /api/ocr/scan
 * สแกนสลิป/ใบเสร็จและบันทึกลง Google Sheets อัตโนมัติ
 *
 * Body (multipart/form-data):
 *   - file: ไฟล์ภาพสลิป/ใบเสร็จ
 *   - type: ประเภท (รายรับ/รายจ่าย) - default: รายจ่าย
 *   - provider: ค่าย OCR (tesseract/aws/iapp/appman/spaceocr) - optional
 *   - recorder: ชื่อผู้บันทึก - optional
 *   - platform: ช่องทาง - optional
 */
router.post('/scan', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาแนบไฟล์ภาพสลิป/ใบเสร็จ' });
    }

    const type = req.body.type || 'รายจ่าย';
    const provider = req.body.provider || null; // null = ใช้ค่าจาก .env
    const recorder = req.body.recorder || 'OCR Upload';
    const platform = req.body.platform || 'API';

    // ประมวลผล OCR
    const ocrResult = await processImage(req.file.buffer, provider);

    // บันทึกลง Google Sheets
    await saveRecord({
      item: ocrResult.item || 'สแกนจากสลิป/ใบเสร็จ',
      type,
      amount: ocrResult.amount || 0,
      category: ocrResult.category || 'ทั่วไป',
      note: `OCR:${provider || process.env.OCR_PROVIDER || 'tesseract'}`,
      platform,
      recorder
    });

    return res.json({
      success: true,
      message: 'บันทึกเรียบร้อยแล้ว',
      ocr: ocrResult,
      saved: {
        item: ocrResult.item,
        type,
        amount: ocrResult.amount,
        category: ocrResult.category
      }
    });

  } catch (error) {
    console.error('[OCR ROUTE ERROR]', error.message);
    const invalidInput = error.message.includes('OCR provider') || error.message.includes('รองรับเฉพาะไฟล์ภาพ');
    return res.status(invalidInput ? 400 : 502).json({
      error: invalidInput ? error.message : 'ไม่สามารถประมวลผล OCR ได้',
    });
  }
});

/**
 * POST /api/ocr/scan-dialogflow
 * สแกนสลิปและส่งผลกลับในรูปแบบ Dialogflow Fulfillment Response
 * ใช้เมื่อเชื่อมต่อกับ Dialogflow ผ่าน Custom Payload
 */
router.post('/scan-dialogflow', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json(buildDialogflowResponse('❌ กรุณาส่งรูปภาพสลิป/ใบเสร็จมาด้วยครับ'));
    }

    const type = req.body.type || 'รายจ่าย';
    const provider = req.body.provider || null;
    const recorder = req.body.recorder || 'Dialogflow OCR';
    const platform = req.body.platform || 'Dialogflow';

    const ocrResult = await processImage(req.file.buffer, provider);

    await saveRecord({
      item: ocrResult.item || 'สแกนจากสลิป/ใบเสร็จ',
      type,
      amount: ocrResult.amount || 0,
      category: ocrResult.category || 'ทั่วไป',
      note: `OCR:${provider || process.env.OCR_PROVIDER || 'tesseract'}`,
      platform,
      recorder
    });

    const responseText = buildOCRConfirmation(ocrResult, type);
    return res.json(buildDialogflowResponse(responseText));

  } catch (error) {
    console.error('[OCR DIALOGFLOW ERROR]', error.message);
    return res.json(buildDialogflowResponse(`❌ ไม่สามารถอ่านสลิปได้: ${error.message}`));
  }
});

/**
 * GET /api/ocr/providers
 * ดูรายชื่อ OCR providers ที่รองรับและ provider ที่ใช้งานอยู่
 */
router.get('/providers', (req, res) => {
  res.json({
    current: process.env.OCR_PROVIDER || 'tesseract',
    providers: getAvailableProviders()
  });
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'ไฟล์มีขนาดเกิน 10 MB'
      : 'ไฟล์อัปโหลดไม่ถูกต้อง';
    return res.status(400).json({ error: message, code: error.code });
  }
  if (error.message === 'รองรับเฉพาะไฟล์ภาพ JPEG, PNG, HEIC เท่านั้น') {
    return res.status(415).json({ error: error.message });
  }
  return next(error);
});

module.exports = router;
