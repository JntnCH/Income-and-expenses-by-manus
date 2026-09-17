const express = require('express');
const router = express.Router();
const { saveRecord, saveInvestmentRecord, getBalanceSummary } = require("../services/googleSheets");
const { queryExcelData } = require("../services/excelQueryService");
const { extractUser, formatUserLabel } = require('../utils/userExtractor');
const { cacheCardPayload } = require('./imageCard');
const { resolveCategory } = require('../services/categoryManager');
const { rememberProjectIdFromSession } = require('../services/dialogflowEntityService');
const chatService = require('../services/chatService');
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
 * รับ Webhook จาก Dialogflow และประมวลผลตาม Intent พร้อมตอบกลับด้วยข้อความและรูปภาพการ์ด
 */
router.post('/dialogflow', async (req, res) => {
  try {
    const body = req.body;
    const intentName = body?.queryResult?.intent?.displayName;
    const parameters = body?.queryResult?.parameters || {};
    const queryText = body?.queryResult?.queryText || '';

    // บันทึก project ID จาก session ของ Dialogflow (ถ้ามี)
    if (body?.session) {
      rememberProjectIdFromSession(body.session);
    }

    const userInfo = extractUser(body);
    const recorderLabel = formatUserLabel(userInfo);

    console.log(`[DIALOGFLOW] Intent: ${intentName} | Query: "${queryText}"`);
    console.log(`[DIALOGFLOW] Parameters:`, JSON.stringify(parameters));

    // ============================================================
    // ดึงค่า parameters พื้นฐาน
    // ============================================================
    const amount = extractAmount(parameters);
    
    // ดึงหมวดหมู่จาก Entity (Income_category หรือ Expense-category)
    const incomeCategory = extractEntity(parameters, ['Income_category', 'income_category']);
    const expenseCategory = extractEntity(parameters, ['Expense-category', 'expense-category']);
    
    // ดึงค่า Account (เช่น กสิกร, เงินสด, SCB)
    const account = extractEntity(parameters, ['account', 'Account', 'bank']) || 'เงินสด';

    // ดึงชื่อรายการ (item)
    let item = parameters.item || 
               parameters.Income_categoryoriginal || 
               parameters['Expense-categoryoriginal'] || 
               incomeCategory || 
               expenseCategory || 
               'ไม่ระบุ';

    let responseText = '';
    let imageUrl = null;

    switch (intentName) {
      case 'บันทึกรายรับ': {
        // แก้ไขหมวดหมู่เวลาบันทึกข้อมูลไม่ตรง (Resolve & Normalize Category)
        const resolution = resolveCategory({
          item,
          category: incomeCategory,
          type: 'รายรับ',
          queryText
        });
        const category = resolution.resolvedCategory;
        if (item === 'ไม่ระบุ' && resolution.matchedKeyword) {
          item = resolution.matchedKeyword;
        }

        console.log(`[CATEGORY RESOLVED] รายรับ | Raw: "${incomeCategory}" -> Final: "${category}" (${resolution.method})`);

        try {
          await saveRecord({
            item,
            type: 'รายรับ',
            amount,
            category,
            account,
            platform: userInfo.platform,
            recorder: recorderLabel
          });
        } catch (sheetErr) {
          console.warn('[SHEETS WARN] Saving to local chat ledger:', sheetErr.message);
          chatService.recordTransaction({
            type: 'รายรับ',
            item,
            amount,
            category,
            account,
            platform: userInfo.platform,
            recorder: recorderLabel
          });
        }
        responseText = buildIncomeConfirmation(item, amount, category, account);
        try {
          imageUrl = cacheCardPayload('transaction', {
            type: 'รายรับ',
            item,
            amount,
            category,
            account,
            recorder: recorderLabel,
            platform: userInfo.platform
          }, req);
        } catch (e) {
          console.warn('[CARD WARN]', e.message);
        }
        break;
      }

      case 'บันทึกรายจ่าย': {
        // แก้ไขหมวดหมู่เวลาบันทึกข้อมูลไม่ตรง (Resolve & Normalize Category)
        const resolution = resolveCategory({
          item,
          category: expenseCategory,
          type: 'รายจ่าย',
          queryText
        });
        const category = resolution.resolvedCategory;
        if (item === 'ไม่ระบุ' && resolution.matchedKeyword) {
          item = resolution.matchedKeyword;
        }

        console.log(`[CATEGORY RESOLVED] รายจ่าย | Raw: "${expenseCategory}" -> Final: "${category}" (${resolution.method})`);

        try {
          await saveRecord({
            item,
            type: 'รายจ่าย',
            amount,
            category,
            account,
            platform: userInfo.platform,
            recorder: recorderLabel
          });
        } catch (sheetErr) {
          console.warn('[SHEETS WARN] Saving to local chat ledger:', sheetErr.message);
          chatService.recordTransaction({
            type: 'รายจ่าย',
            item,
            amount,
            category,
            account,
            platform: userInfo.platform,
            recorder: recorderLabel
          });
        }
        responseText = buildExpenseConfirmation(item, amount, category, account);
        try {
          imageUrl = cacheCardPayload('transaction', {
            type: 'รายจ่าย',
            item,
            amount,
            category,
            account,
            recorder: recorderLabel,
            platform: userInfo.platform
          }, req);
        } catch (e) {
          console.warn('[CARD WARN]', e.message);
        }
        break;
      }

      case 'เช็คยอด':
      case 'CheckBalance': {
        try {
          let summary;
          try {
            summary = await getBalanceSummary();
          } catch (sheetErr) {
            console.warn('[SHEETS WARN] Fetching balance from local ledger:', sheetErr.message);
            summary = chatService.getBalanceSummary();
          }
          responseText = buildBalanceSummary(summary);
          try {
            imageUrl = cacheCardPayload('balance', summary, req);
          } catch (e) {
            console.warn('[CARD WARN]', e.message);
          }
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

        try {
          imageUrl = cacheCardPayload('investment', {
            action,
            assetType,
            assetName,
            quantity,
            pricePerUnit,
            totalAmount
          }, req);
        } catch (e) {
          console.warn('[CARD WARN]', e.message);
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
        // Fallback or unhandled intents
        // ตรวจสอบว่าเป็นคำสั่งจัดการ Entity (เช่น /entity) หรือไม่
        if (queryText && (queryText.toLowerCase().startsWith('/entity') || queryText.toLowerCase().startsWith('/หมวดหมู่'))) {
          try {
            const chatResult = await chatService.processChatMessage(queryText, { req, recorder: recorderLabel, platform: userInfo.platform });
            responseText = chatResult.text;
          } catch (err) {
            responseText = `❌ ข้อผิดพลาดคำสั่ง Entity: ${err.message}`;
          }
        } else {
          responseText = `ขออภัยค่ะ ฉันได้รับ Intent "${intentName}" แต่ยังไม่ได้ตั้งค่าการทำงานใน Webhook`;
        }
      }
    }

    return res.json(buildDialogflowResponse(responseText, imageUrl));

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

module.exports = router;
