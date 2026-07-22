const express = require('express');
const router = express.Router();
const path = require('path');
const { saveRecord, saveInvestmentRecord, getBalanceSummary } = require("../services/googleSheets");
const { queryExcelData } = require("../services/excelQueryService");
const { extractUser, formatUserLabel } = require('../utils/userExtractor');
const { cleanupOldReceipts } = require('../utils/imageGenerator');
const { sendReceiptPhoto, sendTextMessage } = require('../utils/telegramBot');
const {
  buildDialogflowResponse,
  buildDialogflowImageResponse,
  buildDialogflowMixedResponse,
  buildIncomeConfirmation,
  buildExpenseConfirmation,
  buildOCRConfirmation,
  buildBuyInvestmentConfirmation,
  buildSellInvestmentConfirmation,
  buildBalanceSummary,
  buildBalanceSummaryText
} = require('../utils/responseBuilder');

// ============================================================
// Config: URL สำหรับเข้าถึงรูปภาพจากภายนอก
// ============================================================
const BASE_URL = process.env.BASE_URL || 'https://your-domain.com';
const RECEIPTS_URL = `${BASE_URL}/receipts`;

/**
 * POST /webhook/dialogflow
 * รับ Webhook จาก Dialogflow และประมวลผลตาม Intent
 */
router.post('/dialogflow', async (req, res) => {
  cleanupOldReceipts();

  try {
    const body = req.body;
    const intentName = body?.queryResult?.intent?.displayName;
    const parameters = body?.queryResult?.parameters || {};
    const queryText = body?.queryResult?.queryText || '';

    const userInfo = extractUser(body);
    const recorderLabel = formatUserLabel(userInfo);

    // ดึง chat_id จาก Telegram (ถ้ามี)
    const chatId = body?.originalDetectIntentRequest?.payload?.data?.chat?.id ||
                   body?.originalDetectIntentRequest?.payload?.data?.message?.chat?.id;

    console.log(`[DIALOGFLOW] Intent: ${intentName}`);
    console.log(`[DIALOGFLOW] Parameters:`, JSON.stringify(parameters));
    console.log(`[DIALOGFLOW] QueryText: ${queryText}`);
    console.log(`[DIALOGFLOW] ChatID: ${chatId}`);

    // ============================================================
    // ดึงค่า parameters พื้นฐาน
    // ============================================================
    const amount = extractAmount(parameters);
    const incomeCategory = extractEntity(parameters, ['Income_category', 'income_category']);
    const expenseCategory = extractEntity(parameters, ['Expense-category', 'expense-category']);
    const account = extractEntity(parameters, ['account', 'Account', 'bank']) || 'ไม่ระบุ';

    const item = parameters.item ||
                 parameters['Income_category.original'] ||
                 parameters['Expense-category.original'] ||
                 incomeCategory ||
                 expenseCategory ||
                 'ไม่ระบุ';

    let responsePayload = null;

    switch (intentName) {
      // ============================================================
      // บันทึกรายรับ / รายจ่าย → ส่งรูปสลิป
      // ============================================================
      case 'บันทึกรายรับ':
      case 'บันทึกรายจ่าย': {
        let finalType = intentName === 'บันทึกรายจ่าย' ? 'รายจ่าย' : 'รายรับ';
        const detectedType = detectTransactionType(queryText);
        if (detectedType && detectedType !== finalType) {
          console.log(`[⚠️ OVERRIDE] Intent: ${intentName} | ข้อความ: "${queryText}" → ปรับเป็น: ${detectedType}`);
          finalType = detectedType;
        }

        const category = finalType === 'รายรับ'
          ? (incomeCategory || 'รายได้ทั่วไป')
          : (expenseCategory || 'ทั่วไป');

        const safeAmount = Math.abs(amount);

        await saveRecord({
          item,
          type: finalType,
          amount: safeAmount,
          category,
          account,
          platform: userInfo.platform,
          recorder: recorderLabel
        });

        const receipt = finalType === 'รายรับ'
          ? await buildIncomeConfirmation(item, safeAmount, category, account, recorderLabel)
          : await buildExpenseConfirmation(item, safeAmount, category, account, recorderLabel);

        const imageUrl = `${RECEIPTS_URL}/${receipt.filename}`;

        // ถ้ามี chatId → ส่งรูปผ่าน Telegram API โดยตรง (ชัดเจนกว่า)
        if (chatId) {
          try {
            await sendReceiptPhoto(chatId, receipt.imagePath, receipt.caption);
            // ตอบกลับ Dialogflow แบบข้อความสั้น (ป้องกันซ้ำซ้อน)
            responsePayload = buildDialogflowResponse(receipt.textFallback);
          } catch (tgErr) {
            console.error('[TELEGRAM SEND ERROR]', tgErr.message);
            responsePayload = buildDialogflowMixedResponse(receipt.textFallback, imageUrl, receipt.caption);
          }
        } else {
          responsePayload = buildDialogflowMixedResponse(receipt.textFallback, imageUrl, receipt.caption);
        }
        break;
      }

      // ============================================================
      // เช็คยอด → ส่งรูปสรุปยอด + ข้อความสำรอง
      // ============================================================
      case 'เช็คยอด':
      case 'CheckBalance': {
        try {
          const summary = await getBalanceSummary();

          // สร้างข้อความสรุปยอด (fallback ใช้ทันทีถ้าสร้างรูปไม่ได้)
          const textSummary = buildBalanceSummaryText(summary);

          let imageUrl = null;
          let receipt = null;

          try {
            // พยายามสร้างรูปภาพ
            receipt = await buildBalanceSummary(summary, recorderLabel);
            imageUrl = `${RECEIPTS_URL}/${receipt.filename}`;
          } catch (imgErr) {
            console.error('[IMAGE GEN ERROR]', imgErr.message);
            // ถ้าสร้างรูปไม่ได้ → ใช้ข้อความอย่างเดียว
            responsePayload = buildDialogflowResponse(textSummary);
            break;
          }

          // ถ้ามี chatId → ส่งรูปผ่าน Telegram API โดยตรง
          if (chatId && receipt) {
            try {
              await sendReceiptPhoto(chatId, receipt.imagePath, receipt.caption);
              responsePayload = buildDialogflowResponse(textSummary);
            } catch (tgErr) {
              console.error('[TELEGRAM SEND ERROR]', tgErr.message);
              responsePayload = buildDialogflowMixedResponse(textSummary, imageUrl, receipt.caption);
            }
          } else {
            // ไม่มี chatId → ส่งผ่าน Dialogflow payload
            responsePayload = buildDialogflowMixedResponse(textSummary, imageUrl, receipt.caption);
          }

        } catch (err) {
          console.error('[BALANCE ERROR]', err.message);
          responsePayload = buildDialogflowResponse(`❌ ไม่สามารถดึงยอดคงเหลือได้: ${err.message}`);
        }
        break;
      }

      // ============================================================
      // บันทึกการซื้อ/ขายสินทรัพย์ → ส่งรูปสลิป
      // ============================================================
      case 'บันทึกการขาย':
      case 'บันทึกการซื้อ': {
        const action = intentName.includes('ซื้อ') ? 'ซื้อ' : 'ขาย';
        const assetType = extractEntity(parameters, ['Asset-type', 'asset-type']) || 'อื่นๆ';
        const assetName = parameters.item || 'ไม่ระบุ';
        const quantity = parameters.number || 0;
        const pricePerUnit = parameters['unit-currency']?.amount || 0;
        const totalAmount = amount ?? (quantity * pricePerUnit) ?? 0;

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

        const receipt = action === 'ซื้อ'
          ? await buildBuyInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount, recorderLabel)
          : await buildSellInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount, recorderLabel);

        const imageUrl = `${RECEIPTS_URL}/${receipt.filename}`;

        if (chatId) {
          try {
            await sendReceiptPhoto(chatId, receipt.imagePath, receipt.caption);
            responsePayload = buildDialogflowResponse(receipt.textFallback);
          } catch (tgErr) {
            responsePayload = buildDialogflowMixedResponse(receipt.textFallback, imageUrl, receipt.caption);
          }
        } else {
          responsePayload = buildDialogflowMixedResponse(receipt.textFallback, imageUrl, receipt.caption);
        }
        break;
      }

      // ============================================================
      // Query Excel → ยังคงเป็นข้อความ
      // ============================================================
      case 'QueryExcel': {
        const excelQuery = parameters.query || queryText;
        if (excelQuery) {
          try {
            const answer = await queryExcelData(excelQuery);
            responsePayload = buildDialogflowResponse(answer);
          } catch (err) {
            console.error('[QUERY ERROR]', err.message);
            responsePayload = buildDialogflowResponse(`❌ AI ไม่สามารถวิเคราะห์ข้อมูลได้: ${err.message}`);
          }
        } else {
          responsePayload = buildDialogflowResponse("ขออภัยครับ ไม่พบคำถามที่ต้องการให้ค้นหาใน Excel");
        }
        break;
      }

      default: {
        responsePayload = buildDialogflowResponse(
          `ขออภัยค่ะ ฉันได้รับ Intent "${intentName}" แต่ยังไม่ได้ตั้งค่าการทำงานใน Webhook`
        );
      }
    }

    return res.json(responsePayload);

  } catch (error) {
    console.error('[DIALOGFLOW ERROR]', error.message);
    let errorMsg = '❌ เกิดข้อผิดพลาดในการประมวลผล';
    if (error.message.includes('auth') || error.message.includes('grant')) {
      errorMsg = '❌ ปัญหาการยืนยันตัวตน Google: กรุณาตรวจสอบ Service Account Key ใน .env';
    } else if (error.message.includes('spreadsheet') || error.message.includes('found')) {
      errorMsg = '❌ หาไฟล์ Google Sheets ไม่พบ: กรุณาตรวจสอบ ID และการ Share สิทธิ์';
    } else if (error.message.includes('puppeteer') || error.message.includes('browser')) {
      errorMsg = '❌ ไม่สามารถสร้างรูปภาพได้: กรุณาตรวจสอบการติดตั้ง Puppeteer';
    }
    return res.json(buildDialogflowResponse(`${errorMsg}\n(รายละเอียด: ${error.message})`));
  }
});

// ============================================================
// Helper Functions
// ============================================================

function extractAmount(parameters) {
  const raw = parameters.amount ?? parameters.number ?? parameters['unit-currency']?.amount;
  if (raw === undefined || raw === null) return 0;
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? 0 : parsed;
}

function extractEntity(parameters, keys) {
  for (const key of keys) {
    const val = parameters[key];
    if (!val) continue;

    if (Array.isArray(val) && val.length > 0) {
      const firstItem = val[0];
      if (typeof firstItem === 'object') {
        return firstItem.name ?? firstItem.toString?.() ?? JSON.stringify(firstItem);
      }
      return firstItem;
    }
    if (typeof val === 'object' && val.name) return val.name;
    if (typeof val === 'string') return val;
  }
  return null;
}

function detectTransactionType(text) {
  if (!text) return null;

  const expenseKeywords = ['ซื้อ', 'โอน', 'จ่าย'];
  const incomeKeywords = ['รับ', 'ได้รับ', 'รับเงิน'];

  const hasExpense = expenseKeywords.some(kw => text.includes(kw));
  const hasIncome = incomeKeywords.some(kw => text.includes(kw));

  if (hasExpense && !hasIncome) return 'รายจ่าย';
  if (hasIncome && !hasExpense) return 'รายรับ';
  return null;
}

module.exports = router;
