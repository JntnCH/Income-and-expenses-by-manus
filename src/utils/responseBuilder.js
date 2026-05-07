/**
 * Response Builder Utility
 * สร้างข้อความตอบกลับสำหรับ Dialogflow ในรูปแบบต่างๆ
 */

/**
 * สร้าง Dialogflow Fulfillment Response
 * @param {string} text - ข้อความตอบกลับ
 * @returns {Object} Dialogflow response object
 */
function buildDialogflowResponse(text) {
  return {
    fulfillmentMessages: [
      {
        text: {
          text: [text]
        }
      }
    ]
  };
}

/**
 * สร้างข้อความยืนยันการบันทึกรายรับ
 */
function buildIncomeConfirmation(item, amount, category) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 หมวดหมู่ ${category} 💰\n\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

/**
 * สร้างข้อความยืนยันการบันทึกรายจ่าย
 */
function buildExpenseConfirmation(item, amount, category) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 หมวดหมู่ ${category} 💪\n\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

/**
 * สร้างข้อความยืนยันการบันทึกการขาย
 */
function buildSaleConfirmation(item, amount, category) {
  return `📝 ฉันบันทึก ขาย${item}\n` +
         `📂 หมวดหมู่ ${category} 🛍️\n\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

/**
 * สร้างข้อความยืนยันการบันทึกการซื้อ
 */
function buildPurchaseConfirmation(item, amount, category) {
  return `📝 ฉันบันทึก ซื้อ${item}\n` +
         `📂 หมวดหมู่ ${category} 🛒\n\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

/**
 * สร้างข้อความสรุปยอดคงเหลือ (รวมข้อมูลจากทุก Sheet)
 */
function buildBalanceSummary(summary) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  let itemsText = '';
  if (summary.todayItems && summary.todayItems.length > 0) {
    itemsText = summary.todayItems
      .map(i => {
        const sheetTag = i.sheet ? ` [${i.sheet}]` : '';
        return `${i.item} ${formatAmount(i.amount)} บาท${sheetTag}`;
      })
      .join('\n');
  } else {
    itemsText = 'ยังไม่มีรายการวันนี้';
  }

  const sheetInfo = summary.sheetsScanned
    ? `\n📋 รวมข้อมูลจาก ${summary.sheetsScanned} ชีต`
    : '';

  return `📅 ยอดประจำวันที่ ${dateStr}${sheetInfo}\n\n` +
         `📝 รายการวันนี้\n${itemsText}\n\n` +
         `💸 รายรับวันนี้  ${formatAmount(summary.dailyIncome)} บาท\n` +
         `🛍️ รายจ่ายวันนี้  ${formatAmount(summary.dailyExpense)} บาท\n\n` +
         `💰 รายรับเดือนนี้  ${formatAmount(summary.monthlyIncome)} บาท\n` +
         `📄 รายจ่ายเดือนนี้  ${formatAmount(summary.monthlyExpense)} บาท\n\n` +
         `🪙 ยอดคงเหลือ ${formatAmount(summary.balance)} บาท`;
}

/**
 * สร้างข้อความยืนยันการบันทึกจาก OCR
 */
function buildOCRConfirmation(ocrResult, type) {
  const typeEmoji = type === 'รายรับ' ? '💰' : '🛒';
  const typeText = type === 'รายรับ' ? 'รายรับ' : 'รายจ่าย';

  return `🔍 สแกน${typeText}จากสลิป/ใบเสร็จ\n\n` +
         `📝 รายการ: ${ocrResult.item || 'ไม่ระบุ'}\n` +
         `${typeEmoji} จำนวน: ${formatAmount(ocrResult.amount)} บาท\n` +
         `📂 หมวดหมู่: ${ocrResult.category || 'ทั่วไป'}\n\n` +
         `✅ บันทึกเรียบร้อยแล้ว`;
}

/**
 * จัดรูปแบบตัวเลขเงิน
 */
function formatAmount(amount) {
  return parseFloat(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

module.exports = {
  buildDialogflowResponse,
  buildIncomeConfirmation,
  buildExpenseConfirmation,
  buildSaleConfirmation,
  buildPurchaseConfirmation,
  buildBalanceSummary,
  buildOCRConfirmation,
  formatAmount
};
