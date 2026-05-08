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
 *
 * Entities ที่รองรับ:
 *   - Income_category  → ใช้กับ Intent: บันทึกรายรับ, บันทึกการขาย
 *   - Expense-category → ใช้กับ Intent: บันทึกรายจ่าย, บันทึกการซื้อ
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

    // ============================================================
    // ดึงค่า parameters จาก Dialogflow
    // ============================================================
    const item = extractItem(parameters);
    const amount = extractAmount(parameters);

    // ดึงหมวดหมู่จาก Entities ก่อน ถ้าไม่มีค่อย infer จากชื่อรายการ
    const incomeCategory = extractIncomeCategory(parameters);
    const expenseCategory = extractExpenseCategory(parameters);

    let responseText = '';

    switch (intentName) {
      // ============================================================
      // Intent 1: บันทึกรายรับ — ใช้ Entity: Income_category
      // ============================================================
      case 'บันทึกรายรับ': {
        const category = incomeCategory || inferCategory(item, 'income');
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
      // Intent 2: บันทึกรายจ่าย — ใช้ Entity: Expense-category
      // ============================================================
      case 'บันทึกรายจ่าย': {
        const category = expenseCategory || inferCategory(item, 'expense');
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
      // Intent 3: บันทึกการขาย — ใช้ Entity: Income_category
      // ============================================================
      case 'บันทึกการขาย': {
        const category = incomeCategory || inferCategory(item, 'income');
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
      // Intent 4: บันทึกการซื้อ — ใช้ Entity: Expense-category
      // ============================================================
      case 'บันทึกการซื้อ': {
        const category = expenseCategory || inferCategory(item, 'expense');
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
      // Intent 5: CheckBalance — ดูยอดคงเหลือ (รวมทุก Sheet)
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

/**
 * ดึงชื่อรายการจาก parameters
 */
function extractItem(parameters) {
  return parameters.item ||
         parameters.product ||
         parameters.any ||
         parameters['sys.any'] ||
         'ไม่ระบุรายการ';
}

/**
 * ดึงจำนวนเงินจาก parameters
 */
function extractAmount(parameters) {
  if (parameters.number) return parseFloat(parameters.number);
  if (parameters['unit-currency']?.amount) return parseFloat(parameters['unit-currency'].amount);
  if (parameters.amount) return parseFloat(parameters.amount);
  return 0;
}

/**
 * ดึงหมวดหมู่รายรับจาก Entity: Income_category
 * Dialogflow ส่งค่า Entity มาใน parameters ด้วยชื่อ Entity เป็น key
 * รองรับทั้งรูปแบบ string และ object (กรณี Composite Entity)
 */
function extractIncomeCategory(parameters) {
  const raw = parameters['Income_category'] ||
              parameters['income_category'] ||
              parameters['Income-category'] ||
              null;

  if (!raw) return null;

  // กรณี Entity ส่งมาเป็น object (เช่น { name: "ค่าแรง" })
  if (typeof raw === 'object' && raw !== null) {
    return raw.name || raw.value || raw.category || JSON.stringify(raw);
  }

  // กรณี Entity ส่งมาเป็น string โดยตรง
  return String(raw).trim() || null;
}

/**
 * ดึงหมวดหมู่รายจ่ายจาก Entity: Expense-category
 * รองรับทั้งรูปแบบ string และ object (กรณี Composite Entity)
 */
function extractExpenseCategory(parameters) {
  const raw = parameters['Expense-category'] ||
              parameters['expense-category'] ||
              parameters['Expense_category'] ||
              parameters['expense_category'] ||
              null;

  if (!raw) return null;

  // กรณี Entity ส่งมาเป็น object
  if (typeof raw === 'object' && raw !== null) {
    return raw.name || raw.value || raw.category || JSON.stringify(raw);
  }

  // กรณี Entity ส่งมาเป็น string โดยตรง
  return String(raw).trim() || null;
}

/**
 * Fallback: infer หมวดหมู่จากชื่อรายการ (ใช้เมื่อ Dialogflow ไม่ส่ง Entity มา)
 * @param {string} item - ชื่อรายการ
 * @param {string} mode - 'income' หรือ 'expense'
 */
function inferCategory(item, mode = 'expense') {
  const itemLower = (item || '').toLowerCase();

  if (mode === 'income') {
    const incomeCategoryMap = {
      'ค่าแรง/เงินเดือน': ['ค่าแรง', 'เงินเดือน', 'โบนัส', 'ค่าจ้าง', 'ค่าตอบแทน'],
      'รายได้จากการขาย': ['ขาย', 'ขายของ', 'ขายสินค้า', 'ขายออนไลน์'],
      'รายได้อื่นๆ': ['ดอกเบี้ย', 'เงินปันผล', 'ให้เช่า', 'รายได้พิเศษ']
    };
    for (const [category, keywords] of Object.entries(incomeCategoryMap)) {
      if (keywords.some(kw => itemLower.includes(kw))) return category;
    }
    return 'รายได้ทั่วไป';
  }

  // mode === 'expense'
  const expenseCategoryMap = {
    'อาหาร': ['ข้าว', 'อาหาร', 'ก๋วยเตี๋ยว', 'ส้มตำ', 'ผัด', 'ต้ม', 'แกง', 'ขนม', 'เบเกอรี่', 'ร้านอาหาร'],
    'เครื่องดื่ม': ['กาแฟ', 'ชา', 'เครื่องดื่ม', 'นม', 'น้ำผลไม้', 'โซดา', 'เบียร์'],
    'เดินทาง': ['รถ', 'แท็กซี่', 'บัส', 'รถไฟ', 'น้ำมัน', 'ค่าเดินทาง', 'grab', 'bolt'],
    'ค่าสาธารณูปโภค': ['ไฟ', 'น้ำ', 'อินเทอร์เน็ต', 'โทรศัพท์', 'ค่าไฟ', 'ค่าน้ำ'],
    'สุขภาพ': ['ยา', 'หมอ', 'โรงพยาบาล', 'คลินิก', 'วิตามิน'],
    'ช้อปปิ้ง': ['เสื้อ', 'กางเกง', 'รองเท้า', 'กระเป๋า', 'ซื้อของ', 'ห้าง'],
    'วัตถุดิบ/สินค้า': ['วัตถุดิบ', 'สินค้า', 'ของ', 'ผลิตภัณฑ์']
  };

  for (const [category, keywords] of Object.entries(expenseCategoryMap)) {
    if (keywords.some(kw => itemLower.includes(kw))) return category;
  }

  return 'ทั่วไป';
}

module.exports = router;
