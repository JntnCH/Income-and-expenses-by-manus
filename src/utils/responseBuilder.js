/**
 * Response Builder Utility
 * สร้างข้อความตอบกลับสำหรับ Dialogflow ในรูปแบบต่างๆ
 */

/**
 * สร้าง Dialogflow Fulfillment Response
 */
function buildDialogflowResponse(text) {
  return {
    fulfillmentMessages: [
      { text: { text: [text] } }
    ]
  };
}

/**
 * ยืนยันการบันทึกรายรับ
 */
/**
 * สร้างข้อความยืนยันการบันทึก (รองรับทั้งรายรับและรายจ่าย)
 * @param {string} type - ประเภทธุรกรรม ('รายรับ' หรือ 'รายจ่าย')
 * @param {string} item - ชื่อรายการ
 * @param {number} amount - จำนวนเงิน
 * @param {string} category - หมวดหมู่
 */
function buildConfirmationMessage(type, item, amount, category) {
  return `📂 ประเภท: ${type} - ${category}\n` +
         `📝 รายการ: ${item}\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ บันทึกให้คุณเรียบร้อยแล้ว`;
}

/**
 * ยืนยันการบันทึกการซื้อสินทรัพย์
 */
function buildBuyInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount) {
  let lines = [];
  lines.push(`📝 ฉันบันทึก ซื้อ${assetType}`);
  lines.push(`📈 สินทรัพย์: ${assetName}`);
  lines.push('');
  if (quantity > 0) lines.push(`📦 จำนวน: ${quantity}`);
  if (pricePerUnit > 0) lines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  if (totalAmount > 0) lines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  lines.push('');
  lines.push('✅ ให้คุณเรียบร้อยแล้ว');
  return lines.join('\n');
}

/**
 * ยืนยันการบันทึกการขายสินทรัพย์
 */
function buildSellInvestmentConfirmation(assetName, assetType, quantity, pricePerUnit, totalAmount) {
  let lines = [];
  lines.push(`📝 ฉันบันทึก ขาย${assetType}`);
  lines.push(`📈 สินทรัพย์: ${assetName}`);
  lines.push('');
  if (quantity > 0) lines.push(`📦 จำนวน: ${quantity}`);
  if (pricePerUnit > 0) lines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  if (totalAmount > 0) lines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  lines.push('');
  lines.push('✅ ให้คุณเรียบร้อยแล้ว');
  return lines.join('\n');
}

/**
 * สรุปยอดคงเหลือ ตามรูปแบบที่ผู้ใช้ต้องการ (จากรูปภาพ)
 * ปรับปรุง: ตัด Markdown Table และ Header ส่วนเกินออก
 */
function buildBalanceSummary(summary) {
  let itemsText = '';
  if (summary.todayItems && summary.todayItems.length > 0) {
    itemsText = summary.todayItems
      .map(i => `- ${i.item} ${formatAmount(i.amount)} บาท`)
      .join('\n');
  } else {
    itemsText = '- ยังไม่มีรายการวันนี้';
  }

function buildSummaryMessage(summary, itemsText) {
  return `📅 *ยอดประจำวันที่ ${summary.formattedDate}*
📋 ข้อมูลจาก : ${summary.summarySheet}

━━━━━━━━━━━━━━━━━━━━
📝 *รายการวันนี้*
${itemsText}
━━━━━━━━━━━━━━━━━━━━

💸 รายรับวันนี้: ${formatAmount(summary.dailyIncome)} บาท
🛍️ รายจ่ายวันนี้: ${formatAmount(summary.dailyExpense)} บาท

💰 รายรับเดือนนี้: ${formatAmount(summary.monthlyIncome)} บาท
📄 รายจ่ายเดือนนี้: ${formatAmount(summary.monthlyExpense)} บาท

🪙 *ยอดคงเหลือ: ${formatAmount(summary.balance)} บาท*`;
}
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
  buildBuyInvestmentConfirmation,
  buildSellInvestmentConfirmation,
  buildBalanceSummary,
  formatAmount,
};
