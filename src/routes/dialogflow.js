const express = require('express');
const router = express.Router();
const { saveRecord, saveInvestmentRecord, getBalanceSummary } = require('../services/googleSheets');
const { extractUser, formatUserLabel } = require('../utils/userExtractor');
const {
  buildDialogflowResponse,
  buildIncomeConfirmation,
  buildExpenseConfirmation,
  buildBuyInvestmentConfirmation,
  buildSellInvestmentConfirmation,
  buildBalanceSummary
} = require('../utils/responseBuilder');

/**
 * POST /webhook/dialogflow
 * รับ Webhook จาก Dialogflow และประมวลผลตาม Intent
 * รองรับ: Telegram, LINE, Facebook Messenger
 *
 * Entities ที่รองรับ:
 *   - Income_category    → ใช้กับ Intent: บันทึกรายรับ
 *   - Expense-category   → ใช้กับ Intent: บันทึกรายจ่าย
 *   - Asset-type         → ใช้กับ Intent: บันทึกการซื้อ / บันทึกการขาย
 *                          ค่า: หุ้น | กองทุน | ทองคำ | คริปโต | อื่นๆ
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
    // ดึงค่า parameters พื้นฐาน
    // ============================================================
    const item = extractItem(parameters);
    const amount = extractAmount(parameters);
    const incomeCategory = extractEntity(parameters, ['Income_category', 'income_category', 'Income-category']);
    const expenseCategory = extractEntity(parameters, ['Expense-category', 'expense-category', 'Expense_category', 'expense_category']);

    // ============================================================
    // Parameters เฉพาะสำหรับการซื้อ/ขายสินทรัพย์
    // ============================================================
    const assetType = extractEntity(parameters, ['Asset-type', 'asset-type', 'Asset_type', 'asset_type']);
    const assetName = extractItem(parameters);          // ชื่อสินทรัพย์ เช่น "PTT", "Bitcoin", "ทองคำ 96.5%"
    const quantity = extractQuantity(parameters);       // จำนวนหน่วย/หุ้น/กรัม
    const pricePerUnit = extractPricePerUnit(parameters); // ราคาต่อหน่วย (ถ้ามี)
    const totalAmount = amount || (quantity * pricePerUnit) || 0; // ยอดรวม

    let responseText = '';

    switch (intentName) {
      // ============================================================
      // Intent 1: บันทึกรายรับ — ใช้ Entity: Income_category
      // ============================================================
      case 'บันทึกรายรับ': {
        const category = incomeCategory || inferIncomeCategory(item);
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
        const category = expenseCategory || inferExpenseCategory(item);
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
      // Intent 3: บันทึกการขาย — ขายสินทรัพย์การลงทุน
      // ใช้ Entity: Asset-type (หุ้น / กองทุน / ทองคำ / คริปโต / อื่นๆ)
      // ============================================================
      case 'บันทึกการขาย': {
        const resolvedAssetType = assetType || inferAssetType(assetName);
        await saveInvestmentRecord({
          action: 'ขาย',
          assetType: resolvedAssetType,
          assetName,
          quantity,
          pricePerUnit,
          totalAmount,
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        responseText = buildSellInvestmentConfirmation(assetName, resolvedAssetType, quantity, pricePerUnit, totalAmount);
        break;
      }

      // ============================================================
      // Intent 4: บันทึกการซื้อ — ซื้อสินทรัพย์การลงทุน
      // ใช้ Entity: Asset-type (หุ้น / กองทุน / ทองคำ / คริปโต / อื่นๆ)
      // ============================================================
      case 'บันทึกการซื้อ': {
        const resolvedAssetType = assetType || inferAssetType(assetName);
        await saveInvestmentRecord({
          action: 'ซื้อ',
          assetType: resolvedAssetType,
          assetName,
          quantity,
          pricePerUnit,
          totalAmount,
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        responseText = buildBuyInvestmentConfirmation(assetName, resolvedAssetType, quantity, pricePerUnit, totalAmount);
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

function extractItem(parameters) {
  return parameters.item ||
         parameters.asset ||
         parameters.product ||
         parameters.any ||
         parameters['sys.any'] ||
         'ไม่ระบุ';
}

function extractAmount(parameters) {
  if (parameters.number) return parseFloat(parameters.number);
  if (parameters['unit-currency']?.amount) return parseFloat(parameters['unit-currency'].amount);
  if (parameters.amount) return parseFloat(parameters.amount);
  if (parameters.total) return parseFloat(parameters.total);
  return 0;
}

function extractQuantity(parameters) {
  // จำนวนหน่วย/หุ้น/กรัม/เหรียญ
  if (parameters.quantity) return parseFloat(parameters.quantity);
  if (parameters.unit) return parseFloat(parameters.unit);
  if (parameters.volume) return parseFloat(parameters.volume);
  if (parameters['sys.unit-weight']?.amount) return parseFloat(parameters['sys.unit-weight'].amount);
  return 0;
}

function extractPricePerUnit(parameters) {
  // ราคาต่อหน่วย
  if (parameters.price) return parseFloat(parameters.price);
  if (parameters.price_per_unit) return parseFloat(parameters.price_per_unit);
  if (parameters['unit-currency']?.amount && parameters.quantity) {
    return parseFloat(parameters['unit-currency'].amount) / parseFloat(parameters.quantity);
  }
  return 0;
}

/**
 * ดึงค่า Entity จาก parameters รองรับหลายชื่อ key
 */
function extractEntity(parameters, keys) {
  for (const key of keys) {
    const raw = parameters[key];
    if (!raw) continue;
    if (typeof raw === 'object' && raw !== null) {
      return raw.name || raw.value || raw.category || JSON.stringify(raw);
    }
    const val = String(raw).trim();
    if (val) return val;
  }
  return null;
}

/**
 * Infer ประเภทสินทรัพย์จากชื่อ (fallback)
 */
function inferAssetType(assetName) {
  const name = (assetName || '').toLowerCase();

  if (/bitcoin|btc|eth|ethereum|bnb|usdt|crypto|คริปโต|บิทคอยน์|อีเธอ/.test(name)) return 'คริปโต';
  if (/ทอง|gold|สมาคมค้าทองคำ|96\.5|99\.99/.test(name)) return 'ทองคำ';
  if (/กองทุน|fund|rmf|ssf|ltf|etf/.test(name)) return 'กองทุน';
  if (/หุ้น|stock|ตลาดหลักทรัพย์|set|mai|[A-Z]{2,5}/.test(name)) return 'หุ้น';

  return 'อื่นๆ';
}

function inferIncomeCategory(item) {
  const itemLower = (item || '').toLowerCase();
  const map = {
    'ค่าแรง/เงินเดือน': ['ค่าแรง', 'เงินเดือน', 'โบนัส', 'ค่าจ้าง', 'ค่าตอบแทน'],
    'รายได้จากการขาย': ['ขาย', 'ขายของ', 'ขายสินค้า'],
    'รายได้อื่นๆ': ['ดอกเบี้ย', 'เงินปันผล', 'ให้เช่า', 'รายได้พิเศษ']
  };
  for (const [cat, kws] of Object.entries(map)) {
    if (kws.some(kw => itemLower.includes(kw))) return cat;
  }
  return 'รายได้ทั่วไป';
}

function inferExpenseCategory(item) {
  const itemLower = (item || '').toLowerCase();
  const map = {
    'อาหาร': ['ข้าว', 'อาหาร', 'ก๋วยเตี๋ยว', 'ส้มตำ', 'ผัด', 'ต้ม', 'แกง', 'ขนม', 'เบเกอรี่'],
    'เครื่องดื่ม': ['กาแฟ', 'ชา', 'เครื่องดื่ม', 'นม', 'น้ำผลไม้', 'โซดา'],
    'เดินทาง': ['รถ', 'แท็กซี่', 'บัส', 'รถไฟ', 'น้ำมัน', 'ค่าเดินทาง', 'grab'],
    'ค่าสาธารณูปโภค': ['ไฟ', 'น้ำ', 'อินเทอร์เน็ต', 'โทรศัพท์', 'ค่าไฟ', 'ค่าน้ำ'],
    'สุขภาพ': ['ยา', 'หมอ', 'โรงพยาบาล', 'คลินิก', 'วิตามิน'],
    'ช้อปปิ้ง': ['เสื้อ', 'กางเกง', 'รองเท้า', 'กระเป๋า', 'ซื้อของ', 'ห้าง']
  };
  for (const [cat, kws] of Object.entries(map)) {
    if (kws.some(kw => itemLower.includes(kw))) return cat;
  }
  return 'ทั่วไป';
}

module.exports = router;
