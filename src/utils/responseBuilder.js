/**
 * Response Builder Utility
 * สร้างข้อความตอบกลับสำหรับ Dialogflow ในรูปแบบต่างๆ
 */

/**
 * สร้าง Dialogflow Fulfillment Response
 * @param {string} text - ข้อความที่ต้องการตอบกลับ
 */
function buildDialogflowResponse(text) {
  return {
    fulfillmentMessages: [
      { text: { text: [text] } }
    ]
  };
}

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
 * สร้างข้อความยืนยันการซื้อ/ขายสินทรัพย์ (รวมเป็นฟังก์ชันเดียว)
 * @param {string} action - การกระทำ ('ซื้อ' หรือ 'ขาย')
 * @param {string} assetName - ชื่อสินทรัพย์
 * @param {string} assetType - ประเภทสินทรัพย์ (หุ้น, คริปโต, ฯลฯ)
 * @param {number} quantity - จำนวน
 * @param {number} pricePerUnit - ราคาต่อหน่วย
 * @param {number} totalAmount - ยอดรวม
 */
function buildInvestmentConfirmation(action, assetName, assetType, quantity, pricePerUnit, totalAmount) {
  let lines = [];
  lines.push(`📂 ประเภท: ${action}${assetType}`);
  lines.push(`📈 สินทรัพย์: ${assetName}`);
  if (quantity > 0) lines.push(`📦 จำนวน: ${quantity}`);
  if (pricePerUnit > 0) lines.push(`💲 ราคา/หน่วย: ${formatAmount(pricePerUnit)} บาท`);
  if (totalAmount > 0) lines.push(`💵 ยอดรวม: ${formatAmount(totalAmount)} บาท`);
  lines.push('');
  lines.push('✅ บันทึกให้คุณเรียบร้อยแล้ว');
  return lines.join('\n');
}

/**
 * สรุปยอดคงเหลือ (เรียกใช้ buildSummaryMessage ภายใน)
 * @param {Object} summary - ข้อมูลสรุปยอด
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
  
  return buildSummaryMessage(summary, itemsText);
}

/**
 * สร้างข้อความสรุปยอด (รูปแบบที่ปรับปรุงแล้ว)
 * @param {Object} summary - ข้อมูลสรุปยอด
 * @param {string} itemsText - ข้อความรายการวันนี้
 */
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

/**
 * จัดรูปแบบตัวเลขเงิน
 * @param {number|string} amount - จำนวนเงิน
 */
function formatAmount(amount) {
  return parseFloat(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

module.exports = {
  buildDialogflowResponse,
  buildConfirmationMessage,        // ✅ แทนที่ buildIncomeConfirmation และ buildExpenseConfirmation
  buildInvestmentConfirmation,     // ✅ แทนที่ buildBuyInvestmentConfirmation และ buildSellInvestmentConfirmation
  buildBalanceSummary,
  buildSummaryMessage,             // ✅ เพิ่มเข้ามา (แยกออกมาให้เรียกใช้ตรงๆ ได้)
  formatAmount,
};
