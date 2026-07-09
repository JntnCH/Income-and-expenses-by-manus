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
function buildIncomeConfirmation(item, amount, category) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 ประเภท รายรับ : ${category} \n\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
}

/**
 * ยืนยันการบันทึกรายจ่าย
 */
function buildExpenseConfirmation(item, amount, category) {
  return `📝 ฉันบันทึก ${item}\n` +
         `📂 ประเภท รายจ่าย : ${category}\n\n` +
         `💵 จำนวน ${formatAmount(amount)} บาท\n\n` +
         `✅ ให้คุณเรียบร้อยแล้ว`;
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
 * สรุปยอดคงเหลือ
 */
function buildBalanceSummary(summary) {
  let itemsText = '';
  if (summary.todayItems && summary.todayItems.length > 0) {
    itemsText = summary.todayItems
      .map(i => {
        return `- ${i.item} ${formatAmount(i.amount)} บาท`;
      })
      .join('\n');
  } else {
    itemsText = 'ยังไม่มีรายการวันนี้';
  }

return (
  `## 📅 ยอดประจำวันที่ ${summary.formattedDate}\n` +
  `> 📋 ข้อมูลจาก : ${summary.summarySheet}\n\n` +
  `---\n` +
  `### 📝 รายการวันนี้\n${itemsText}\n\n` +
  `---\n` +
  `### 💸 สรุปรายวัน\n` +
  `| ประเภท | จำนวน |\n` +
  `|--------|-------|\n` +
  `| รายรับวันนี้ | **${formatAmount(summary.dailyIncome)} บาท** |\n` +
  `| รายจ่ายวันนี้ | **${formatAmount(summary.dailyExpense)} บาท** |\n\n` +
  `### 💰 สรุปรายเดือน\n` +
  `| ประเภท | จนวน |\n` +
  `|--------|-------|\n` +
  `| รายรับเดือนนี้ | **${formatAmount(summary.monthlyIncome)} บาท** |\n` +
  `| รายจ่ายเดือนนี้ | **${formatAmount(summary.monthlyExpense)} บาท** |\n\n` +
  `---\n` +
  `### 🪙 ยอดคงเหลือ : **${formatAmount(summary.balance)} บาท**`
);

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
  formatAmount
};
