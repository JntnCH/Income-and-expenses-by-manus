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
 */
router.post('/dialogflow', async (req, res) => {
  try {
    const body = req.body;
    const intentName = body?.queryResult?.intent?.displayName;
    const parameters = body?.queryResult?.parameters || {};

    const userInfo = extractUser(body);
    const recorderLabel = formatUserLabel(userInfo);

    console.log(`[DIALOGFLOW] Intent: ${intentName}`);
    console.log(`[DIALOGFLOW] Parameters:`, JSON.stringify(parameters));

    // ============================================================
    // ดึงค่า parameters พื้นฐาน (รองรับโครงสร้างเดิมจากไฟล์ ZIP)
    // ============================================================
    const amount = extractAmount(parameters);
    
    // ดึงหมวดหมู่จาก Entity (Income_category หรือ Expense-category)
    const incomeCategory = extractEntity(parameters, ['Income_category', 'income_category']);
    const expenseCategory = extractEntity(parameters, ['Expense-category', 'expense-category']);
    
    // ดึงชื่อรายการ (item)
    // จากไฟล์ ZIP: บันทึกรายรับใช้ "item" ที่มีค่าเป็น "$Income_category"
    // บันทึกรายจ่ายใช้ "Expense-categoryoriginal" หรือเดาจากหมวดหมู่
    const item = parameters.item || 
                 parameters.Income_categoryoriginal || 
                 parameters['Expense-categoryoriginal'] || 
                 incomeCategory || 
                 expenseCategory || 
                 'ไม่ระบุ';

    let responseText = '';

    switch (intentName) {
      case 'บันทึกรายรับ': {
        const category = incomeCategory || 'รายได้ทั่วไป';
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

      case 'บันทึกรายจ่าย': {
        const category = expenseCategory || 'ทั่วไป';
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

      case 'CheckBalance': {
        const summary = await getBalanceSummary();
        responseText = buildBalanceSummary(summary);
        break;
      }

      // รองรับ Intent อื่นๆ ถ้ามี
      case 'บันทึกการขาย':
      case 'บันทึกการซื้อ': {
        const action = intentName.includes('ซื้อ') ? 'ซื้อ' : 'ขาย';
        const assetType = extractEntity(parameters, ['Asset-type', 'asset-type']) || 'อื่นๆ';
        const assetName = parameters.item || 'ไม่ระบุ';
        const quantity = parameters.number || 0;
        const pricePerUnit = parameters['unit-currency']?.amount || 0;
        const totalAmount = amount || (quantity * pricePerUnit) || 0;

        await saveInvestmentRecord({
          action,
          assetType,
          assetName,
          quantity,
          pricePerUnit,
          totalAmount,
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        
        if (action === 'ซื้อ') {
          responseText = buildBuyInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount);
        } else {
          responseText = buildSellInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount);
        }
        break;
      }

      default: {
        responseText = `ขออภัยค่ะ ฉันได้รับ Intent "${intentName}" แต่ยังไม่ได้ตั้งค่าการทำงานใน Webhook`;
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

function extractAmount(parameters) {
  if (parameters.amount) return parseFloat(parameters.amount);
  if (parameters.number) return parseFloat(parameters.number);
  if (parameters['unit-currency']?.amount) return parseFloat(parameters['unit-currency'].amount);
  return 0;
}

function extractEntity(parameters, keys) {
  for (const key of keys) {
    const val = parameters[key];
    if (!val) continue;
    if (Array.isArray(val) && val.length > 0) return val[0];
    if (typeof val === 'string') return val;
  }
  return null;
}

module.exports = router;
