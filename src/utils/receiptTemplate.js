/**
 * Receipt Template
 * สร้าง HTML สำหรับแปลงเป็นภาพสลิปธนาคาร
 */

const { formatAmount } = require('./responseBuilder');

/**
 * สร้าง HTML สลิปธนาคาร
 * @param {Object} data - ข้อมูลธุรกรรม
 * @returns {string} HTML string
 */
function buildReceiptHTML(data) {
  const {
    type = 'รายจ่าย',
    item = 'ไม่ระบุ',
    amount = 0,
    category = 'ทั่วไป',
    account = 'เงินสด',
    recorder = 'ไม่ระบุ',
    date = new Date(),
    ref = generateRef()
  } = data;

  const isExpense = type === 'รายจ่าย';
  const theme = isExpense 
    ? { gradient: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)', color: '#ff6b6b', icon: '🧾' }
    : { gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: '#11998e', icon: '💰' };

  const thaiDate = date.toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
  const thaiTime = date.toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit'
  });

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Sarabun', 'Prompt', sans-serif;
      background: #f0f0f0;
      width: 400px;
      padding: 20px;
    }
    .receipt {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    }
    .header {
      background: ${theme.gradient};
      padding: 28px 20px;
      text-align: center;
      color: white;
      position: relative;
    }
    .header-icon { font-size: 52px; margin-bottom: 8px; }
    .header-title { font-size: 15px; opacity: 0.95; letter-spacing: 2px; font-weight: 600; }
    .header-sub { font-size: 11px; opacity: 0.8; margin-top: 4px; }
    .header-badge {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(255,255,255,0.25);
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      backdrop-filter: blur(4px);
    }
    .body { padding: 28px 24px; }
    .amount-section {
      text-align: center;
      margin-bottom: 24px;
    }
    .amount-value {
      font-size: 36px;
      font-weight: 700;
      color: ${theme.color};
      letter-spacing: -1px;
    }
    .amount-label {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }
    .divider {
      border-top: 2px dashed #e0e0e0;
      margin: 18px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      font-size: 14px;
    }
    .row-label { color: #888; }
    .row-value { font-weight: 600; color: #333; text-align: right; max-width: 60%; }
    .footer {
      background: #f8f9fa;
      padding: 18px 20px;
      text-align: center;
      border-top: 1px solid #eee;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #d4edda;
      color: #155724;
      padding: 8px 20px;
      border-radius: 24px;
      font-size: 14px;
      font-weight: 700;
    }
    .ref {
      font-size: 11px;
      color: #aaa;
      margin-top: 12px;
      font-family: monospace;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 60px;
      opacity: 0.03;
      font-weight: 700;
      color: #000;
      pointer-events: none;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="receipt" style="position: relative;">
    <div class="watermark">CONFIRMED</div>
    <div class="header">
      <div class="header-badge">${type}</div>
      <div class="header-icon">${theme.icon}</div>
      <div class="header-title">ใบเสร็จอิเล็กทรอนิกส์</div>
      <div class="header-sub">E-RECEIPT</div>
    </div>
    <div class="body">
      <div class="amount-section">
        <div class="amount-value">฿ ${formatAmount(amount)}</div>
        <div class="amount-label">จำนวนเงิน</div>
      </div>
      <div class="divider"></div>
      <div class="row">
        <span class="row-label">รายการ</span>
        <span class="row-value">${escapeHtml(item)}</span>
      </div>
      <div class="row">
        <span class="row-label">หมวดหมู่</span>
        <span class="row-value">${escapeHtml(category)}</span>
      </div>
      <div class="row">
        <span class="row-label">บัญชี</span>
        <span class="row-value">${escapeHtml(account)}</span>
      </div>
      <div class="row">
        <span class="row-label">วันที่</span>
        <span class="row-value">${thaiDate}</span>
      </div>
      <div class="row">
        <span class="row-label">เวลา</span>
        <span class="row-value">${thaiTime} น.</span>
      </div>
      <div class="row">
        <span class="row-label">ผู้บันทึก</span>
        <span class="row-value">${escapeHtml(recorder)}</span>
      </div>
    </div>
    <div class="footer">
      <div class="status-badge">
        <span>✓</span> บันทึกสำเร็จ
      </div>
      <div class="ref">Ref: ${ref}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * สร้าง HTML สลิปสรุปยอด (Balance Summary)
 */
function buildBalanceReceiptHTML(summary, recorder = 'ระบบ') {
  const {
    formattedDate = new Date().toLocaleDateString('th-TH'),
    dailyIncome = 0,
    dailyExpense = 0,
    monthlyIncome = 0,
    monthlyExpense = 0,
    balance = 0,
    accountBalances = [],
    todayItems = []
  } = summary;

  const itemsHtml = todayItems.length > 0
    ? todayItems.map(i => `
        <div class="row" style="margin-bottom: 8px; font-size: 13px;">
          <span class="row-label" style="flex: 1;">${escapeHtml(i.item)}</span>
          <span class="row-value" style="color: ${i.type === 'รายรับ' ? '#11998e' : '#ff6b6b'};">
            ${i.type === 'รายรับ' ? '+' : '-'}${formatAmount(i.amount)}
          </span>
        </div>
      `).join('')
    : '<div style="text-align: center; color: #aaa; font-size: 13px; padding: 8px 0;">- ยังไม่มีรายการวันนี้ -</div>';

  const accountsHtml = accountBalances.length > 0
    ? accountBalances.map(acc => `
        <div class="row" style="margin-bottom: 8px; font-size: 13px;">
          <span class="row-label" style="flex: 1;">🏦 ${escapeHtml(acc.name)}</span>
          <span class="row-value">${formatAmount(acc.amount)} บาท</span>
        </div>
      `).join('')
    : '';

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Sarabun', 'Prompt', sans-serif;
      background: #f0f0f0;
      width: 400px;
      padding: 20px;
    }
    .receipt {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 28px 20px;
      text-align: center;
      color: white;
    }
    .header-icon { font-size: 48px; margin-bottom: 8px; }
    .header-title { font-size: 16px; font-weight: 700; }
    .header-date { font-size: 13px; opacity: 0.9; margin-top: 4px; }
    .body { padding: 24px; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #667eea;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .divider {
      border-top: 2px dashed #e0e0e0;
      margin: 16px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-size: 14px;
    }
    .row-label { color: #666; }
    .row-value { font-weight: 700; color: #333; }
    .highlight {
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
    }
    .highlight .row { margin-bottom: 8px; }
    .highlight .row:last-child { margin-bottom: 0; }
    .total {
      font-size: 24px;
      color: #667eea;
    }
    .footer {
      background: #f8f9fa;
      padding: 16px;
      text-align: center;
      border-top: 1px solid #eee;
    }
    .footer-text { font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="header-icon">📊</div>
      <div class="header-title">สรุปยอดคงเหลือ</div>
      <div class="header-date">${formattedDate}</div>
    </div>
    <div class="body">
      <div class="section-title">รายการวันนี้</div>
      ${itemsHtml}

      <div class="divider"></div>

      <div class="section-title">สรุปรายวัน</div>
      <div class="row">
        <span class="row-label">💸 รายรับวันนี้</span>
        <span class="row-value" style="color: #11998e;">+${formatAmount(dailyIncome)}</span>
      </div>
      <div class="row">
        <span class="row-label">🛍️ รายจ่ายวันนี้</span>
        <span class="row-value" style="color: #ff6b6b;">-${formatAmount(dailyExpense)}</span>
      </div>

      <div class="divider"></div>

      <div class="section-title">สรุปรายเดือน</div>
      <div class="row">
        <span class="row-label">💰 รายรับเดือนนี้</span>
        <span class="row-value" style="color: #11998e;">+${formatAmount(monthlyIncome)}</span>
      </div>
      <div class="row">
        <span class="row-label">🛒 รายจ่ายเดือนนี้</span>
        <span class="row-value" style="color: #ff6b6b;">-${formatAmount(monthlyExpense)}</span>
      </div>

      ${accountsHtml ? `<div class="divider"></div><div class="section-title">ยอดแยกตามบัญชี</div>${accountsHtml}` : ''}

      <div class="highlight">
        <div class="row">
          <span class="row-label" style="font-size: 16px;">ยอดรวมทุกบัญชี</span>
          <span class="row-value total">${formatAmount(balance)} บาท</span>
        </div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-text">บันทึกโดย: ${escapeHtml(recorder)}</div>
    </div>
  </div>
</body>
</html>`;
}

function generateRef() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `TXN-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  buildReceiptHTML,
  buildBalanceReceiptHTML,
  generateRef
};
