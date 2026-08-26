const sharp = require('sharp');

const WIDTH = 240;
const HEIGHT = 240;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toNumber(value) {
  const number = Number.parseFloat(String(value ?? 0).replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function formatAmount(value) {
  return toNumber(value).toLocaleString('th-TH', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
}

function buildBalanceChartSvg(summary = {}) {
  const dailyIncome = toNumber(summary.dailyIncome);
  const dailyExpense = toNumber(summary.dailyExpense);
  const monthlyIncome = toNumber(summary.monthlyIncome);
  const monthlyExpense = toNumber(summary.monthlyExpense);
  const balance = toNumber(summary.balance);
  const date = escapeXml(summary.formattedDate || new Date().toLocaleDateString('th-TH'));
  const maxBarValue = Math.max(monthlyIncome, monthlyExpense, 1);
  const incomeBarHeight = Math.max(2, Math.round((monthlyIncome / maxBarValue) * 66));
  const expenseBarHeight = Math.max(2, Math.round((monthlyExpense / maxBarValue) * 66));
  const incomeBarY = 185 - incomeBarHeight;
  const expenseBarY = 185 - expenseBarHeight;
  const balanceColor = balance >= 0 ? '#34d399' : '#fb7185';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" rx="16" fill="#0f172a"/>
  <text x="14" y="24" fill="#f8fafc" font-size="14" font-weight="700" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">สรุปยอดการเงิน</text>
  <text x="14" y="40" fill="#94a3b8" font-size="9" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">ประจำวันที่ ${date}</text>

  <rect x="12" y="50" width="104" height="36" rx="8" fill="#132e2b"/>
  <text x="20" y="63" fill="#86efac" font-size="8" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">รายรับเดือนนี้</text>
  <text x="20" y="78" fill="#f0fdf4" font-size="11" font-weight="700" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">${formatAmount(monthlyIncome)}</text>

  <rect x="124" y="50" width="104" height="36" rx="8" fill="#3a1e2b"/>
  <text x="132" y="63" fill="#fda4af" font-size="8" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">รายจ่ายเดือนนี้</text>
  <text x="132" y="78" fill="#fff1f2" font-size="11" font-weight="700" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">${formatAmount(monthlyExpense)}</text>

  <text x="12" y="103" fill="#cbd5e1" font-size="9" font-weight="700" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">เปรียบเทียบรายเดือน</text>
  <line x1="12" y1="185" x2="228" y2="185" stroke="#334155" stroke-width="1"/>
  <rect x="62" y="${incomeBarY}" width="42" height="${incomeBarHeight}" rx="5" fill="#4ade80"/>
  <rect x="136" y="${expenseBarY}" width="42" height="${expenseBarHeight}" rx="5" fill="#fb7185"/>
  <text x="83" y="199" text-anchor="middle" fill="#86efac" font-size="8" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">รับ</text>
  <text x="157" y="199" text-anchor="middle" fill="#fda4af" font-size="8" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">จ่าย</text>

  <rect x="12" y="207" width="216" height="21" rx="7" fill="#172033"/>
  <text x="20" y="221" fill="#94a3b8" font-size="8" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">ยอดรวมทุกบัญชี</text>
  <text x="220" y="221" text-anchor="end" fill="${balanceColor}" font-size="11" font-weight="700" font-family="Noto Sans Thai, Noto Sans, Arial, sans-serif">${formatAmount(balance)} บาท</text>
  <title>รายรับวันนี้ ${formatAmount(dailyIncome)} บาท, รายจ่ายวันนี้ ${formatAmount(dailyExpense)} บาท</title>
</svg>`;
}

async function renderBalanceChart(summary) {
  const svg = buildBalanceChartSvg(summary);
  const buffer = await sharp(Buffer.from(svg, 'utf8'))
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return { buffer, contentType: 'image/jpeg', width: WIDTH, height: HEIGHT };
}

module.exports = {
  buildBalanceChartSvg,
  renderBalanceChart,
  formatAmount
};
