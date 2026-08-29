const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { saveRecord, saveInvestmentRecord, getBalanceSummary } = require("../services/googleSheets");
const { queryExcelData } = require("../services/excelQueryService");
const { extractUser, formatUserLabel } = require('../utils/userExtractor');
const { renderBalanceChart } = require('../services/balanceChart');
const { isStorageConfigured, uploadPublicObject } = require('../services/cloudStorage');
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
    // ดึงค่า parameters พื้นฐาน
    // ============================================================
    const amount = extractAmount(parameters);
    
    // ดึงหมวดหมู่จาก Entity (Income_category หรือ Expense-category)
    const incomeCategory = extractEntity(parameters, ['Income_category', 'income_category']);
    const expenseCategory = extractEntity(parameters, ['Expense-category', 'expense-category']);
    
    // ดึงค่า Account (เช่น กสิกร, เงินสด, SCB)
    const account = extractEntity(parameters, ['account', 'Account', 'bank']);

    // ดึงชื่อรายการ (item)
    const item = parameters.item || 
                 parameters.Income_categoryoriginal || 
                 parameters['Expense-categoryoriginal'] || 
                 incomeCategory || 
                 expenseCategory || 
                 'ไม่ระบุ';

    let responseText = '';
    let imageUri = null;

    switch (intentName) {
      case 'บันทึกรายรับ': {
        const category = incomeCategory || 'รายได้ทั่วไป';
        await saveRecord({
          item,
          type: 'รายรับ',
          amount,
          category,
          account, // ส่งค่า Account ไปด้วย
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        responseText = buildIncomeConfirmation(item, amount, category, account);
        break;
      }

      case 'บันทึกรายจ่าย': {
        const category = expenseCategory || 'ทั่วไป';
        await saveRecord({
          item,
          type: 'รายจ่าย',
          amount,
          category,
          account, // ส่งค่า Account ไปด้วย
          platform: userInfo.platform,
          recorder: recorderLabel
        });
        responseText = buildExpenseConfirmation(item, amount, category, account);
        break;
      }

      case 'เช็คยอด':
      case 'CheckBalance': {
        try {
          const summary = await getBalanceSummary();
          responseText = buildBalanceSummary(summary);
          imageUri = await createBalanceChartImage(summary);
        } catch (err) {
          console.error('[BALANCE ERROR]', err.message);
          responseText = `❌ ไม่สามารถดึงยอดคงเหลือได้: ${err.message}`;
        }
        break;
      }

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

      case 'QueryExcel': {
        const queryText = parameters.query || body?.queryResult?.queryText;
        if (queryText) {
          try {
            responseText = await queryExcelData(queryText);
          } catch (err) {
            console.error('[QUERY ERROR]', err.message);
            responseText = `❌ AI ไม่สามารถวิเคราะห์ข้อมูลได้: ${err.message}`;
          }
        } else {
          responseText = "ขออภัยครับ ไม่พบคำถามที่ต้องการให้ค้นหาใน Excel";
        }
        break;
      }

      default: {
        responseText = `ขออภัยค่ะ ฉันได้รับ Intent "${intentName}" แต่ยังไม่ได้ตั้งค่าการทำงานใน Webhook`;
      }
    }

    return res.json(buildDialogflowResponse(responseText, imageUri));

  } catch (error) {
    console.error('[DIALOGFLOW ERROR]', error.message);
    let errorMsg = '❌ เกิดข้อผิดพลาดในการประมวลผล';
    if (error.message.includes('auth') || error.message.includes('grant')) {
      errorMsg = '❌ ปัญหาการยืนยันตัวตน Google: กรุณาตรวจสอบ Service Account Key ใน .env';
    } else if (error.message.includes('spreadsheet') || error.message.includes('found')) {
      errorMsg = '❌ หาไฟล์ Google Sheets ไม่พบ: กรุณาตรวจสอบ ID และการ Share สิทธิ์';
    }
    return res.json(buildDialogflowResponse(`${errorMsg}\n(รายละเอียด: ${error.message})`));
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

async function createBalanceChartImage(summary) {
  if (!isStorageConfigured()) {
    console.warn('[IMAGE] Google Cloud Storage is not configured; using text fallback');
    return null;
  }

  try {
    const rendered = await renderBalanceChart(summary);
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const objectPath = `balance/${dateKey}/${randomUUID()}.jpg`;
    const upload = await uploadPublicObject(rendered.buffer, {
      objectPath,
      contentType: rendered.contentType
    });

    console.log('[IMAGE] Balance chart uploaded:', upload.objectPath);
    return upload.url;
  } catch (error) {
    console.error('[IMAGE] Balance chart generation/upload failed:', error.message);
    return null;
  }
}

module.exports = router;
