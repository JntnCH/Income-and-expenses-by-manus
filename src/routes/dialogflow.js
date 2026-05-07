const express = require('express');
const router = express.Router();
const { saveRecord, getBalanceSummary } = require('../services/googleSheets');
const { extractUser, formatUserLabel } = require('../utils/userExtractor');
const {
  buildDialogflowResponse,
  buildIncomeConfirmation,
  buildExpenseConfirmation,
  buildSaleConfirmation,
  buildPurchaseConfirmation,
  buildBalanceSummary
} = require('../utils/responseBuilder');

/**
 * POST /webhook/dialogflow
 * รับ Webhook จาก Dialogflow และประมวลผลตาม Intent
 * รองรับ: Telegram, LINE, Facebook Messenger
 */
router.post('/dialogflow', async (req, res) => {
  try {
    const body = req.body;
    const intentName = body?.queryResult?.intent?.displayName;
    const parameters = body?.queryResult?.parameters || {};

    // ============================================================
    // ดึงข้อมูลผู้ใช้จากแต่ละช่องทาง
    // ============================================================
    const userInfo = extractUser(body);
    const recorderLabel = formatUserLabel(userInfo);

    console.log(`[DIALOGFLOW] Intent: ${intentName}`);
    console.log(`[DIALOGFLOW] Platform: ${userInfo.platform} | User: ${userInfo.displayName}`);
    console.log(`[DIALOGFLOW] Parameters:`, JSON.stringify(parameters));

    // ดึงค่า parameters จาก Dialogflow
    const item = extractItem(parameters);
    const amount = extractAmount(parameters);
    const category = parameters.category || inferCategory(item);

    let responseText = '';

    switch (intentName) {
      // ============================================================
      // Intent 1: บันทึกรายรับ
      // ============================================================
      case 'บันทึกรายรับ': {
        await saveRecord({
          item,
          type: 'รายรับ',
          amount,
          category,
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        responseText = buildIncomeConfirmation(item, amount, category);
        break;
      }

      // ============================================================
      // Intent 2: บันทึกรายจ่าย
      // ============================================================
      case 'บันทึกรายจ่าย': {
        await saveRecord({
          item,
          type: 'รายจ่าย',
          amount,
          category,
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        responseText = buildExpenseConfirmation(item, amount, category);
        break;
      }

      // ============================================================
      // Intent 3: บันทึกการขาย
      // ============================================================
      case 'บันทึกการขาย': {
        await saveRecord({
          item,
          type: 'รายรับ',
          amount,
          category,
          note: 'การขาย',
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        responseText = buildSaleConfirmation(item, amount, category);
        break;
      }

      // ============================================================
      // Intent 4: บันทึกการซื้อ
      // ============================================================
      case 'บันทึกการซื้อ': {
        await saveRecord({
          item,
          type: 'รายจ่าย',
          amount,
          category,
          note: 'การซื้อ',
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        responseText = buildPurchaseConfirmation(item, amount, category);
        break;
      }

      // ============================================================
      // Intent 5: CheckBalance - ดูยอดคงเหลือ
      // ============================================================
      case 'CheckBalance': {
        const summary = await getBalanceSummary();
        responseText = buildBalanceSummary(summary);
        break;
      }

      default: {
        responseText = `ขออภัยค่ะ ฉันไม่เข้าใจคำสั่ง "${intentName}" กรุณาลองใหม่อีกครั้ง`;
      }
    }

    return res.json(buildDialogflowResponse(responseText));

  } catch (error) {
    console.error('[DIALOGFLOW ERROR]', error.message);
    return res.json(buildDialogflowResponse('❌ เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง'));
  }
});

// ============================================================
// Helper Functions
// ============================================================

function extractItem(parameters) {
  return parameters.item ||
         parameters.product ||
         parameters.any ||
         parameters['sys.any'] ||
         'ไม่ระบุรายการ';
}

function extractAmount(parameters) {
  if (parameters.number) return parseFloat(parameters.number);
  if (parameters['unit-currency']?.amount) return parseFloat(parameters['unit-currency'].amount);
  if (parameters.amount) return parseFloat(parameters.amount);
  return 0;
}

function inferCategory(item) {
  const itemLower = (item || '').toLowerCase();

  const categoryMap = {
    'อาหาร': ['ข้าว', 'กาแฟ', 'ชา', 'น้ำ', 'อาหาร', 'ก๋วยเตี๋ยว', 'ส้มตำ', 'ผัด', 'ต้ม', 'แกง', 'ขนม', 'เบเกอรี่', 'ร้านอาหาร'],
    'เครื่องดื่ม': ['กาแฟ', 'ชา', 'เครื่องดื่ม', 'นม', 'น้ำผลไม้', 'โซดา', 'เบียร์'],
    'เดินทาง': ['รถ', 'แท็กซี่', 'บัส', 'รถไฟ', 'น้ำมัน', 'ค่าเดินทาง', 'grab', 'bolt'],
    'ค่าสาธารณูปโภค': ['ไฟ', 'น้ำ', 'อินเทอร์เน็ต', 'โทรศัพท์', 'ค่าไฟ', 'ค่าน้ำ'],
    'สุขภาพ': ['ยา', 'หมอ', 'โรงพยาบาล', 'คลินิก', 'วิตามิน'],
    'ช้อปปิ้ง': ['เสื้อ', 'กางเกง', 'รองเท้า', 'กระเป๋า', 'ซื้อของ', 'ห้าง'],
    'ค่าแรง': ['ค่าแรง', 'เงินเดือน', 'โบนัส', 'ค่าจ้าง'],
    'การขาย': ['ขาย', 'ขายของ', 'ขายสินค้า']
  };

  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(kw => itemLower.includes(kw))) {
      return category;
    }
  }

  return 'ทั่วไป';
}

module.exports = router;
