const express = require('express');
const router = express.Router();
const {
  saveRecord,
  saveInvestmentRecord,
  getBalanceSummary,
  findTransaction,
  updateTransaction
} = require("../services/googleSheets");
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
  buildBalanceSummary,
  buildEditConfirmation,
  buildMultipleMatchesResponse,
  buildNotFoundResponse
} = require('../utils/responseBuilder');

/**
 * Helper to extract value from Dialogflow parameter that could be String, Number, Object, or Array
 */
function extractParamValue(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    return extractParamValue(val[0]);
  }
  if (typeof val === 'object') {
    if (val.amount !== undefined) return val.amount;
    if (val.number !== undefined) return val.number;
    if (val.name !== undefined) return val.name;
    if (val.item !== undefined) return val.item;
    if (val.text !== undefined) return val.text;
    return JSON.stringify(val);
  }
  return String(val);
}

/**
 * Helper to parse edit parameters from Dialogflow parameters or raw queryText
 */
function parseEditParameters(parameters = {}, queryText = '') {
  const p = parameters;
  
  // transactionId
  const transactionId = extractParamValue(p.transactionId || p.transId || p.txId || p.id || p['รหัสรายการ']);

  // วันที่
  const date = extractParamValue(p.date || p['date-time'] || p['วันที่'] || p.date_old);

  // ประเภท
  const type = extractParamValue(p.type || p['ประเภท'] || p.transType);

  // รายการเดิม
  let oldItem = extractParamValue(p.oldItem || p['รายการเดิม'] || p.item_old || p.item_before || p.item);

  // จำนวนเงินเดิม
  let oldAmount = extractParamValue(p.oldAmount || p['จำนวนเงินเดิม'] || p.amount_old || p.amount_before);

  // รายละเอียดใหม่ / รายการใหม่
  let newItem = extractParamValue(p.newItem || p['รายละเอียดใหม่'] || p['รายการใหม่'] || p.item_new || p.new_item);

  // จำนวนเงินใหม่
  let newAmount = extractParamValue(p.newAmount || p['จำนวนเงินใหม่'] || p.amount_new || p.new_amount || p['unit-currency'] || p.number);

  // หมวดหมู่ใหม่
  let newCategory = extractParamValue(p.newCategory || p['หมวดหมู่ใหม่'] || p.category_new || p['Expense-category'] || p.category);

  // บัญชีใหม่
  let newAccount = extractParamValue(p.newAccount || p['บัญชีใหม่'] || p.account_new || p.account);

  // หมวดหมู่เดิม / บัญชีเดิม
  const oldCategory = extractParamValue(p.oldCategory || p['หมวดหมู่เดิม']);
  const oldAccount = extractParamValue(p.oldAccount || p['บัญชีเดิม']);

  // Fallback parsing from queryText
  if (queryText) {
    const q = queryText.trim();

    // 1. แก้บัญชี (ของ) (รายการ) X เป็น Y
    const accMatch = q.match(/แก้บัญชี(?:ของ)?(?:รายการ)?\s*(.+?)\s*เป็น\s*(.+)/i);
    if (accMatch) {
      if (!oldItem) oldItem = accMatch[1].trim();
      if (!newAccount) newAccount = accMatch[2].trim();
    }

    // 2. แก้หมวดหมู่ (ของ) (รายการ) X เป็น Y
    const catMatch = q.match(/แก้หมวด(?:หมู่)?(?:ของ)?(?:รายการ)?\s*(.+?)\s*เป็น\s*(.+)/i);
    if (catMatch) {
      if (!oldItem) oldItem = catMatch[1].trim();
      if (!newCategory) newCategory = catMatch[2].trim();
    }

    // 3. แก้ (รายการ) [ชื่อรายการ] [จำนวนเดิม] เป็น [จำนวนใหม่]
    const numToNumMatch = q.match(/แก้(?:รายการ)?\s*(.+?)\s*(\d+(?:\.\d+)?)\s*(?:เป็น|->|=)\s*(\d+(?:\.\d+)?)/i);
    if (numToNumMatch) {
      if (!oldItem) oldItem = numToNumMatch[1].trim();
      if (oldAmount === null) oldAmount = parseFloat(numToNumMatch[2]);
      if (newAmount === null) newAmount = parseFloat(numToNumMatch[3]);
    }

    // 4. แก้ (รายการ) [ชื่อรายการ] เป็น [ชื่อใหม่ หรือ ตัวเลขใหม่]
    const genericMatch = q.match(/แก้(?:รายการ)?\s*(.+?)\s*(?:เป็น|->|=)\s*(.+)/i);
    if (genericMatch && !numToNumMatch && !accMatch && !catMatch) {
      if (!oldItem) oldItem = genericMatch[1].trim();
      const targetVal = genericMatch[2].trim();
      if (!isNaN(parseFloat(targetVal))) {
        if (newAmount === null) newAmount = parseFloat(targetVal);
      } else {
        if (!newItem) newItem = targetVal;
      }
    }
  }

  return {
    transactionId,
    date,
    type,
    oldItem,
    oldAmount,
    newItem,
    newAmount,
    newCategory,
    newAccount,
    oldCategory,
    oldAccount
  };
}

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

    let responseText = '';
    let imageUrl = null;

    const amount = extractAmount(parameters);
    const item = extractEntity(parameters, ['item', 'item-name', 'description']) || 'ไม่ระบุ';
    const account = extractEntity(parameters, ['account', 'bank-account', 'payment-method']) || 'เงินสด';

    switch (intentName) {
      case 'บันทึกรายรับ': {
        const rawCategory = extractEntity(parameters, ['Income-category', 'category']) || null;
        const categoryResolution = resolveCategory({
          item,
          category: rawCategory,
          type: 'รายรับ',
          queryText
        });
        const category = categoryResolution.resolvedCategory;

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
            item,
            type: 'รายรับ',
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
        const rawCategory = extractEntity(parameters, ['Expense-category', 'category']) || null;
        const categoryResolution = resolveCategory({
          item,
          category: rawCategory,
          type: 'รายจ่าย',
          queryText
        });
        const category = categoryResolution.resolvedCategory;

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
            item,
            type: 'รายจ่าย',
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

      case 'แก้ไขรายการ':
      case 'EditTransaction':
      case 'updateTransaction':
      case 'แก้ไข': {
        const parsedParams = parseEditParameters(parameters, queryText);
        console.log('[EDIT PARAMS]', JSON.stringify(parsedParams));

        const criteria = {
          transactionId: parsedParams.transactionId,
          date: parsedParams.date,
          type: parsedParams.type,
          oldItem: parsedParams.oldItem,
          oldAmount: parsedParams.oldAmount,
          oldCategory: parsedParams.oldCategory,
          oldAccount: parsedParams.oldAccount
        };

        const updates = {
          newItem: parsedParams.newItem,
          newAmount: parsedParams.newAmount,
          newCategory: parsedParams.newCategory,
          newAccount: parsedParams.newAccount,
          newType: parsedParams.type,
          newDate: parsedParams.date,
          platform: userInfo.platform,
          recorder: recorderLabel
        };

        try {
          const matches = await findTransaction(criteria);
          console.log(`[EDIT MATCHES] Found ${matches.length} matching rows`);

          if (matches.length === 0) {
            responseText = buildNotFoundResponse(criteria);
          } else if (matches.length > 1) {
            responseText = buildMultipleMatchesResponse(matches);
          } else {
            // Found exactly 1 match -> Update in-place & verify
            const targetMatch = matches[0];
            const editResult = await updateTransaction(targetMatch.rowIndex, updates);
            
            responseText = buildEditConfirmation(editResult);

            try {
              imageUrl = cacheCardPayload('edit', editResult, req);
            } catch (cardErr) {
              console.warn('[CARD WARN]', cardErr.message);
            }
          }
        } catch (editErr) {
          console.error('[EDIT ERROR]', editErr.message);
          responseText = `❌ การแก้ไขรายการล้มเหลว: ${editErr.message}`;
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
        const queryTextParam = parameters.query || body?.queryResult?.queryText;
        if (queryTextParam) {
          try {
            responseText = await queryExcelData(queryTextParam);
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
        if (queryText && (queryText.toLowerCase().startsWith('/entity') || queryText.toLowerCase().startsWith('/หมวดหมู่'))) {
          try {
            const chatResult = await chatService.processChatMessage(queryText, { req, recorder: recorderLabel, platform: userInfo.platform });
            responseText = chatResult.text;
          } catch (err) {
            responseText = `❌ ข้อผิดพลาดคำสั่ง Entity: ${err.message}`;
          }
        } else if (queryText && queryText.trim().startsWith('แก้')) {
          // Fallback intent for editing if Dialogflow doesn't match named intent
          const parsedParams = parseEditParameters(parameters, queryText);
          const criteria = {
            transactionId: parsedParams.transactionId,
            date: parsedParams.date,
            type: parsedParams.type,
            oldItem: parsedParams.oldItem,
            oldAmount: parsedParams.oldAmount
          };
          const updates = {
            newItem: parsedParams.newItem,
            newAmount: parsedParams.newAmount,
            newCategory: parsedParams.newCategory,
            newAccount: parsedParams.newAccount,
            platform: userInfo.platform,
            recorder: recorderLabel
          };

          try {
            const matches = await findTransaction(criteria);
            if (matches.length === 0) {
              responseText = buildNotFoundResponse(criteria);
            } else if (matches.length > 1) {
              responseText = buildMultipleMatchesResponse(matches);
            } else {
              const targetMatch = matches[0];
              const editResult = await updateTransaction(targetMatch.rowIndex, updates);
              responseText = buildEditConfirmation(editResult);
              try {
                imageUrl = cacheCardPayload('edit', editResult, req);
              } catch (e) {
                console.warn('[CARD WARN]', e.message);
              }
            }
          } catch (e) {
            responseText = `❌ การแก้ไขรายการล้มเหลว: ${e.message}`;
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
