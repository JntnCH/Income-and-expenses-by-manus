/**
 * Chat Service
 * บริการประมวลผลข้อความแชทภาษาไทย (Thai Financial NLU) สำหรับบอทบันทึกรายรับ-รายจ่าย
 * รองรับการวิเคราะห์ประโยคธรรมชาติ, สแกนสลิป, ตรวจจับหมวดหมู่อัตโนมัติ และแสดงผลการ์ดสรุป
 */

const fs = require('fs');
const path = require('path');
const { resolveCategory } = require('./categoryManager');
const { saveRecord, getBalanceSummary, saveInvestmentRecord } = require('./googleSheets');
const { cacheCardPayload } = require('../routes/imageCard');
const { queryExcelData } = require('./excelQueryService');
const dialogflowEntityService = require('./dialogflowEntityService');

const LEDGER_FILE = path.join(__dirname, '../../data/chat_ledger.json');

// ตรวจสอบและสร้างโฟลเดอร์ data
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ข้อมูลเริ่มต้นสำหรับระบบบัญชีจำลอง
const DEFAULT_LEDGER = {
  accounts: {
    'เงินสด': 4500,
    'กสิกร': 28500,
    'SCB': 15200,
    'พร้อมเพย์': 3400
  },
  transactions: [
    {
      id: 'tx_demo_1',
      date: '15/09/2026',
      time: '08:30',
      type: 'รายรับ',
      item: 'เงินเดือนประจำงวด',
      amount: 45000,
      category: 'เงินเดือน',
      account: 'กสิกร',
      recorder: 'เจ้าของบัญชี',
      platform: 'Web Chat'
    },
    {
      id: 'tx_demo_2',
      date: '16/09/2026',
      time: '07:45',
      type: 'รายจ่าย',
      item: 'ข้าวมันไก่พิเศษ',
      amount: 60,
      category: 'อาหารและเครื่องดื่ม',
      account: 'เงินสด',
      recorder: 'เจ้าของบัญชี',
      platform: 'Web Chat'
    },
    {
      id: 'tx_demo_3',
      date: '16/09/2026',
      time: '08:15',
      type: 'รายจ่าย',
      item: 'กาแฟอเมซอน',
      amount: 65,
      category: 'อาหารและเครื่องดื่ม',
      account: 'กสิกร',
      recorder: 'เจ้าของบัญชี',
      platform: 'Web Chat'
    }
  ]
};

function readLedger() {
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      const content = fs.readFileSync(LEDGER_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('[CHAT LEDGER READ ERROR]', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_LEDGER));
}

function writeLedger(data) {
  try {
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[CHAT LEDGER WRITE ERROR]', err.message);
  }
}

function getBangkokTimeStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getBangkokDateStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
}

/**
 * ดึงจำนวนเงินจากข้อความ
 */
function parseAmount(text) {
  if (!text) return 0;

  // จัดการกรณีทองคำ เช่น 'ทอง 1 บาท 42000' หรือ 'ซื้อทอง 2 สลึง 21000'
  let cleaned = text;
  if (/ทอง\s*\d+\s*(?:บาท|สลึง)/i.test(cleaned)) {
    cleaned = cleaned.replace(/ทอง\s*\d+\s*(?:บาท|สลึง)/i, 'ทอง ');
  }

  // ลำดับที่ 1: ตรวจหาตัวเลขที่มีหน่วยเงินกำกับชัดเจน เช่น '35,000 บาท', '42000.-', '150 ฿'
  const explicit = cleaned.match(/([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:บาท|.-|฿|บ\b)/i);
  if (explicit && explicit[1]) {
    const val = parseFloat(explicit[1].replace(/,/g, ''));
    if (!isNaN(val) && val > 0) return val;
  }

  // ลำดับที่ 2: ตรวจหาตัวเลขทั้งหมดในข้อความ (รองรับทั้งแบบมีลูกน้ำ 35,000 และแบบธรรมดา 35000)
  const matches = [...cleaned.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|\d+(?:\.\d+)?)/g)];
  if (matches.length > 0) {
    const numbers = matches
      .map(m => parseFloat(m[1].replace(/,/g, '')))
      .filter(n => !isNaN(n) && n > 0);
    if (numbers.length > 0) {
      // คืนค่าตัวเลขที่มีนัยสำคัญ (หากมีหลายตัว เลือกตัวสุดท้ายซึ่งมักเป็นยอดเงิน)
      return numbers[numbers.length - 1];
    }
  }
  return 0;
}

/**
 * ตรวจจับชื่อบัญชี/ธนาคาร
 */
function detectAccount(text) {
  if (!text) return 'เงินสด';
  const lower = text.toLowerCase();
  if (lower.includes('กสิกร') || lower.includes('kbank')) return 'กสิกร';
  if (lower.includes('scb') || lower.includes('ไทยพาณิชย์')) return 'SCB';
  if (lower.includes('กรุงเทพ') || lower.includes('bbl')) return 'กรุงเทพ';
  if (lower.includes('กรุงไทย') || lower.includes('ktb')) return 'กรุงไทย';
  if (lower.includes('ttb') || lower.includes('ทหารไทยธนชาต')) return 'TTB';
  if (lower.includes('ออมสิน') || lower.includes('gsb')) return 'ออมสิน';
  if (lower.includes('พร้อมเพย์') || lower.includes('promptpay')) return 'พร้อมเพย์';
  if (lower.includes('ทรูมันนี่') || lower.includes('truemoney') || lower.includes('wallet')) return 'TrueMoney';
  if (lower.includes('บัตรเครดิต') || lower.includes('credit')) return 'บัตรเครดิต';
  if (lower.includes('เงินสด')) return 'เงินสด';
  return 'เงินสด';
}

/**
 * ดึงชื่อรายการ (Item) จากข้อความ
 */
function cleanItemName(text, amount, account) {
  if (!text) return 'ไม่ระบุ';
  let cleaned = text;

  // กรณีพิเศษสำหรับคำยอดนิยม
  if (/เงินเดือน/i.test(cleaned)) return 'เงินเดือน';
  if (/โบนัส/i.test(cleaned)) return 'โบนัส';
  if (/ค่าเน็ต|ค่าอินเทอร์เน็ต/i.test(cleaned)) return 'ค่าเน็ต';
  if (/ค่าไฟ|ค่าไฟฟ้า/i.test(cleaned)) return 'ค่าไฟ';
  if (/ค่าน้ำ|ค่าน้ำประปา/i.test(cleaned)) return 'ค่าน้ำ';
  if (/เติมน้ำมัน|ค่าน้ำมัน/i.test(cleaned)) return 'เติมน้ำมัน';

  // นำตัวเลขและคำว่าบาท/.- ออก
  if (amount > 0) {
    const cleanAmountStr = String(amount);
    const formattedAmountStr = amount.toLocaleString('en-US');
    cleaned = cleaned
      .split(cleanAmountStr).join('')
      .split(formattedAmountStr).join('');
  }

  // นำคำเรียกบัญชีออก
  if (account && account !== 'เงินสด') {
    cleaned = cleaned.replace(new RegExp(account, 'gi'), '');
  }

  // นำคำเชื่อมหรือคำนำหน้าที่พบบ่อยออก
  const prefixes = [
    /^กิน/i, /^ซื้อ/i, /^จ่าย/i, /^เติม/i, /^สั่ง/i, /^โอน/i, /^เลี้ยง/i, /^ชำระ/i,
    /^ได้เงินจาก/i, /^ได้เงิน/i, /^ขายของได้/i,
    /บาท/g, /ค่ะ/g, /ครับ/g, /นะ/g, /.-/g, /฿/g
  ];

  for (const p of prefixes) {
    cleaned = cleaned.replace(p, '');
  }

  cleaned = cleaned.trim();
  return cleaned || 'ไม่ระบุ';
}

/**
 * คำนวณสรุปยอดคงเหลือจากสมุดบัญชีท้องถิ่น
 */
function calculateLocalBalanceSummary() {
  const ledger = readLedger();
  const today = getBangkokDateStr();
  const currentMonth = today.split('/')[1] + '/' + today.split('/')[2];

  let dailyIncome = 0;
  let dailyExpense = 0;
  let monthlyIncome = 0;
  let monthlyExpense = 0;
  const todayItems = [];

  for (const tx of ledger.transactions) {
    const isToday = tx.date === today;
    const isThisMonth = tx.date && tx.date.endsWith(currentMonth);

    if (tx.type === 'รายรับ') {
      if (isToday) dailyIncome += tx.amount;
      if (isThisMonth) monthlyIncome += tx.amount;
      if (isToday) todayItems.push({ item: tx.item, type: 'รายรับ', amount: tx.amount });
    } else if (tx.type === 'รายจ่าย') {
      if (isToday) dailyExpense += tx.amount;
      if (isThisMonth) monthlyExpense += tx.amount;
      if (isToday) todayItems.push({ item: tx.item, type: 'รายจ่าย', amount: tx.amount });
    }
  }

  // คำนวณยอดรวมของทุกบัญชี
  const accountBalances = Object.entries(ledger.accounts || {}).map(([name, amount]) => ({
    name,
    amount
  }));

  const totalBalance = accountBalances.reduce((sum, a) => sum + a.amount, 0);

  return {
    dailyIncome,
    dailyExpense,
    monthlyIncome,
    monthlyExpense,
    balance: totalBalance,
    accountBalances,
    todayItems,
    formattedDate: today
  };
}

/**
 * บันทึก Transaction ลง Ledger ท้องถิ่น
 */
function recordLocalTransaction(tx) {
  const ledger = readLedger();
  const id = 'tx_' + Date.now();
  const newTx = {
    id,
    date: getBangkokDateStr(),
    time: getBangkokTimeStr(),
    ...tx
  };

  ledger.transactions.unshift(newTx);
  if (ledger.transactions.length > 200) {
    ledger.transactions = ledger.transactions.slice(0, 200);
  }

  // ปรับยอดบัญชี
  const acc = tx.account || 'เงินสด';
  if (!ledger.accounts) ledger.accounts = {};
  if (typeof ledger.accounts[acc] !== 'number') {
    ledger.accounts[acc] = 0;
  }

  if (tx.type === 'รายรับ') {
    ledger.accounts[acc] += parseFloat(tx.amount || 0);
  } else if (tx.type === 'รายจ่าย') {
    ledger.accounts[acc] -= parseFloat(tx.amount || 0);
  }

  writeLedger(ledger);
  return newTx;
}

/**
 * ฟังก์ชันหลักในการประมวลผลข้อความแชท
 */
async function processChatMessage(message, options = {}) {
  const { req, recorder = 'ผู้ใช้แชท', platform = 'Web Chat' } = options;
  const rawText = (message || '').trim();

  if (!rawText) {
    return {
      success: true,
      text: 'สวัสดีค่ะ! พิมพ์รายการที่ต้องการบันทึกได้เลยนะคะ เช่น "กินข้าว 60", "ซื้อของ 250", "เติมน้ำมัน 800" หรือ "เช็คยอด"',
      quickReplies: ['กินข้าว 60 บาท', 'เติมน้ำมัน 800', 'เช็คยอดคงเหลือ', 'วิธีใช้งาน']
    };
  }

  const lower = rawText.toLowerCase();

  // 0. Entity Management Commands (เชื่อมต่อกับ Dialogflow Entities)
  if (lower.startsWith('/entity') || lower.startsWith('/หมวดหมู่')) {
    try {
      const parts = rawText.split(/\s+/);
      const command = parts[1]?.toLowerCase();
      
      if (!command || command === 'list') {
        const types = await dialogflowEntityService.listEntityTypes();
        const typeList = types.map(t => `- **${t.displayName}** (${t.entitiesCount} รายการ)`).join('\n');
        return {
          success: true,
          text: `📋 **รายการ Entity Types ใน Dialogflow:**\n\n${typeList || 'ไม่พบ Entity Type'}\n\n💡 คำสั่งเพิ่มเติม:\n• \`/entity get [ชื่อType]\`\n• \`/entity add [ชื่อType] [ค่าหลัก] [คำพ้อง1,คำพ้อง2,...]\`\n• \`/entity del [ชื่อType] [ค่าหลัก]\``,
          quickReplies: ['/entity list', '/entity get Expense-category']
        };
      }
      
      if (command === 'get') {
        const typeName = parts[2];
        if (!typeName) throw new Error('กรุณาระบุชื่อ Entity Type เช่น `/entity get Expense-category`');
        const entityType = await dialogflowEntityService.getEntityType(typeName);
        const entities = (entityType.entities || []).map(e => `• **${e.value}** (คำค้นหา: ${e.synonyms.join(', ')})`).join('\n');
        return {
          success: true,
          text: `🏷️ **หมวดหมู่ใน [${entityType.displayName}]:**\n\n${entities || 'ไม่มีข้อมูลหมวดหมู่'}`,
        };
      }
      
      if (command === 'add' || command === 'set') {
        const typeName = parts[2];
        const value = parts[3];
        const synonymsRaw = parts.slice(4).join(' ');
        if (!typeName || !value) throw new Error('รูปแบบไม่ถูกต้อง ใช้ `/entity add [ชื่อType] [ค่าหลัก] [คำพ้อง1,คำพ้อง2,...]` หรือ `/entity set ...`');
        const synonyms = synonymsRaw ? synonymsRaw.split(',').map(s => s.trim()) : [];
        
        let result;
        if (command === 'set') {
           result = await dialogflowEntityService.setEntityEntry(typeName, value, synonyms);
        } else {
           result = await dialogflowEntityService.addOrUpdateEntityEntry(typeName, value, synonyms);
        }
        
        return {
          success: true,
          text: `✅ **${command === 'set' ? 'ตั้งค่า (แทนที่)' : 'เพิ่ม/อัปเดต'}หมวดหมู่สำเร็จ**\n\n• Type: ${result.entityType}\n• ค่า: ${result.value}\n• คำค้นหา: ${result.synonyms.join(', ')}`,
        };
      }
      
      if (command === 'del' || command === 'delete' || command === 'remove') {
        const typeName = parts[2];
        const value = parts.slice(3).join(' ');
        if (!typeName || !value) throw new Error('รูปแบบไม่ถูกต้อง ใช้ `/entity del [ชื่อType] [ค่าหลัก]`');
        const result = await dialogflowEntityService.deleteEntityEntry(typeName, value);
        return {
          success: true,
          text: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
        };
      }
      
      throw new Error(`ไม่รู้จักคำสั่ง "${command}"`);
      
    } catch (err) {
      return {
        success: false,
        text: `❌ **ข้อผิดพลาด (Dialogflow Entity):**\n${err.message}`
      };
    }
  }

  // 1. ตรวจจับคำทักทาย / วิธีใช้ (Help & Greeting)
  if (
    lower === 'สวัสดี' || lower === 'hello' || lower === 'hi' ||
    lower.includes('วิธีใช้') || lower.includes('ช่วยอะไรได้บ้าง') ||
    lower.includes('ทำอะไรได้บ้าง') || lower === 'help' || lower === 'เมนู'
  ) {
    return {
      success: true,
      text: `🤖 **ยินดีต้อนรับสู่ระบบบันทึกรายรับ-รายจ่ายอัจฉริยะ!**\n\n` +
            `คุณสามารถพิมพ์คุยเพื่อบันทึกรายการได้ง่ายๆ ตามรูปแบบดังนี้ค่ะ:\n` +
            `• **บันทึกรายจ่าย**: พิมพ์ *"กินข้าวมันไก่ 50"*, *"ซื้อของเซเว่น 150"*, *"เติมน้ำมัน 800 กสิกร"*\n` +
            `• **บันทึกรายรับ**: พิมพ์ *"เงินเดือนเข้า 35000"*, *"ขายของได้ 1200"*, *"โบนัส 5000"*\n` +
            `• **เช็คยอดเงิน**: พิมพ์ *"เช็คยอด"*, *"ยอดคงเหลือ"*, *"สรุปเงิน"*\n` +
            `• **สแกนสลิป/ใบเสร็จ**: กดปุ่มรูปกล้องถ่ายรูป/แนบไฟล์ภาพสลิปได้เลย ระบบจะอ่านยอดเงินและบันทึกอัตโนมัติ!\n` +
            `• **การลงทุน**: พิมพ์ *"ซื้อทอง 1 บาท 42000"*, *"ซื้อหุ้น 5000"*`,
      quickReplies: ['กินข้าว 60 บาท', 'เติมน้ำมัน 800', 'เงินเดือนเข้า 35000', 'เช็คยอดคงเหลือ']
    };
  }

  // 2. ตรวจจับคำถามเช็คยอด (Check Balance)
  if (
    lower.includes('เช็คยอด') || lower.includes('ดูยอด') ||
    lower.includes('ยอดคงเหลือ') || lower.includes('ยอดเงิน') ||
    lower.includes('เหลือเท่าไหร่') || lower.includes('เหลือเงิน') ||
    lower.includes('สรุปยอด') || lower.includes('balance') ||
    lower.includes('สรุปวันนี้') || lower.includes('กระเป๋าตัง')
  ) {
    let summary;
    let sheetsSyncStatus = '';

    // พยายามดึงจาก Google Sheets ถ้ามีสิทธิ์
    try {
      if (process.env.GOOGLE_SPREADSHEET_ID && 
          (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)) {
        summary = await getBalanceSummary();
        sheetsSyncStatus = ' (ดึงข้อมูลล่าสุดจาก Google Sheets)';
      }
    } catch (e) {
      console.warn('[CHAT] Google Sheets getBalanceSummary failed, fallback to local:', e.message);
    }

    // หากไม่ได้ดึงจาก Google Sheets ให้ใช้ข้อมูล Ledger ในระบบ
    if (!summary) {
      summary = calculateLocalBalanceSummary();
      sheetsSyncStatus = ' (ข้อมูลสรุปจากระบบ)';
    }

    let cardUrl = null;
    if (req) {
      try {
        cardUrl = cacheCardPayload('balance', summary, req);
      } catch (e) {
        console.warn('[CARD ERROR]', e.message);
      }
    }

    const dailyIncStr = Number(summary.dailyIncome || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    const dailyExpStr = Number(summary.dailyExpense || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });
    const totalBalStr = Number(summary.balance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 });

    let text = `📊 **สรุปยอดบัญชีวันนี้ (${summary.formattedDate})**${sheetsSyncStatus}\n\n` +
               `💰 **ยอดคงเหลือสุทธิ:** **${totalBalStr} บาท**\n` +
               `📈 รายรับวันนี้: +${dailyIncStr} บาท\n` +
               `📉 รายจ่ายวันนี้: -${dailyExpStr} บาท\n`;

    if (summary.accountBalances && summary.accountBalances.length > 0) {
      text += `\n💳 **ยอดแยกตามบัญชี:**\n` +
              summary.accountBalances.map(a => `• ${a.name}: ${Number(a.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`).join('\n');
    }

    return {
      success: true,
      text,
      cardImageUrl: cardUrl,
      intent: 'เช็คยอด',
      data: summary,
      quickReplies: ['กินข้าว 60 บาท', 'เติมน้ำมัน 800', 'เงินเดือนเข้า 35000', 'ดูรายงานละเอียด']
    };
  }

  // 3. ตรวจจับการลงทุน (Investment: ซื้อ/ขาย ทอง, หุ้น, คริปโต)
  const isInvestment = lower.includes('ซื้อทอง') || lower.includes('ขายทอง') ||
                       lower.includes('ซื้อหุ้น') || lower.includes('ขายหุ้น') ||
                       lower.includes('ซื้อเหรียญ') || lower.includes('ขายเหรียญ') ||
                       lower.includes('ซื้อกองทุน') || lower.includes('ขายกองทุน');

  if (isInvestment) {
    const action = (lower.includes('ขาย') && !lower.includes('ซื้อ')) ? 'ขาย' : 'ซื้อ';
    let assetType = 'ทองคำ';
    if (lower.includes('หุ้น')) assetType = 'หุ้น';
    else if (lower.includes('เหรียญ') || lower.includes('btc') || lower.includes('crypto')) assetType = 'คริปโต';
    else if (lower.includes('กองทุน')) assetType = 'กองทุนรวม';

    const amount = parseAmount(rawText);
    
    // ดึงจำนวนหน่วย (Quantity) เช่น '1 บาท', '50 หุ้น', '2 สลึง'
    let quantity = 1;
    const qtyMatch = rawText.match(/(\d+(?:\.\d+)?)\s*(?:บาททอง|บาท|หน่วย|หุ้น|เหรียญ|สลึง)/i);
    if (qtyMatch && qtyMatch[1]) {
      const parsedQty = parseFloat(qtyMatch[1]);
      if (parsedQty > 0 && parsedQty !== amount) {
        quantity = parsedQty;
      }
    }

    let assetName = assetType;
    if (lower.includes('ทอง')) assetName = 'ทองคำแท่ง/รูปพรรณ';
    else if (lower.includes('หุ้น')) {
      const stockMatch = rawText.match(/หุ้น\s*([A-Za-z0-9_]+)/i);
      assetName = stockMatch ? `หุ้น ${stockMatch[1].toUpperCase()}` : 'หุ้น';
    } else if (lower.includes('btc') || lower.includes('บิทคอยน์')) assetName = 'Bitcoin (BTC)';
    else if (lower.includes('eth')) assetName = 'Ethereum (ETH)';

    const pricePerUnit = quantity > 0 ? (amount / quantity) : amount;

    const investData = {
      action,
      assetType,
      assetName,
      quantity,
      pricePerUnit,
      totalAmount: amount,
      recorder,
      platform,
      date: getBangkokDateStr() + ' ' + getBangkokTimeStr()
    };

    let cardUrl = null;
    if (req) {
      try {
        cardUrl = cacheCardPayload('investment', investData, req);
      } catch (e) {
        console.warn('[CARD ERROR]', e.message);
      }
    }

    // บันทึกลง Google Sheets ถ้ามี
    try {
      await saveInvestmentRecord(investData);
    } catch (e) {
      console.warn('[INVEST RECORD GOOGLE SHEETS WARN]', e.message);
    }

    return {
      success: true,
      text: `🪙 **บันทึกการ${action}สินทรัพย์เรียบร้อยแล้วค่ะ**\n\n` +
            `• ประเภท: ${assetType}\n` +
            `• รายการ: ${assetName}\n` +
            `• ยอดเงินรวม: **${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท**`,
      cardImageUrl: cardUrl,
      intent: `บันทึกการ${action}`,
      data: investData,
      quickReplies: ['เช็คยอดคงเหลือ', 'บันทึกรายจ่าย', 'สแกนสลิป']
    };
  }

  // 4. สกัดจำนวนเงินและบัญชี
  const amount = parseAmount(rawText);
  const account = detectAccount(rawText);

  if (amount <= 0) {
    // ถ้าไม่มีตัวเลข อาจเป็นคำถามวิเคราะห์ข้อมูล เช่น "เดือนนี้ใช้ไปเท่าไหร่"
    if (lower.includes('เท่าไหร่') || lower.includes('กี่บาท') || lower.includes('สรุป')) {
      try {
        const aiAnswer = await queryExcelData(rawText);
        return {
          success: true,
          text: aiAnswer,
          intent: 'QueryExcel',
          quickReplies: ['เช็คยอดคงเหลือ', 'กินข้าว 60 บาท', 'วิธีใช้งาน']
        };
      } catch (e) {
        // Fallback
      }
    }

    return {
      success: true,
      text: `ขออภัยค่ะ ฉันตรวจไม่พบ "จำนวนเงิน" ในข้อความที่คุณพิมพ์ 🤔\n\n` +
            `ลองพิมพ์แบบระบุยอดเงินด้วยนะคะ เช่น:\n` +
            `• *"กินข้าว 60"*\n` +
            `• *"ซื้อของเซเว่น 150"*\n` +
            `• *"เติมน้ำมัน 800 กสิกร"*\n` +
            `• *"เงินเดือน 35000"*`,
      quickReplies: ['กินข้าว 60 บาท', 'เติมน้ำมัน 800', 'เช็คยอดคงเหลือ']
    };
  }

  // 5. แยกประเภท: รายรับ vs รายจ่าย
  const incomeKeywords = [
    'เงินเดือน', 'รายได้', 'ขายของได้', 'ได้เงิน', 'เงินเข้า',
    'โบนัส', 'เงินปันผล', 'ดอกเบี้ย', 'กำไร', 'รับเงิน', 'ถูกหวย', 'ค่าจ้าง'
  ];

  const isExplicitIncome = incomeKeywords.some(kw => lower.includes(kw)) ||
                          lower.startsWith('รายรับ') || lower.includes('รับเงิน');
  const type = isExplicitIncome ? 'รายรับ' : 'รายจ่าย';

  // 6. สกัดชื่อรายการและแก้ไขหมวดหมู่ให้อัตโนมัติ (Resolve & Normalize Category)
  const cleanItem = cleanItemName(rawText, amount, account);
  const categoryResolution = resolveCategory({
    item: cleanItem,
    category: null,
    type,
    queryText: rawText
  });

  const resolvedCategory = categoryResolution.resolvedCategory;
  const finalItem = (cleanItem === 'ไม่ระบุ' && categoryResolution.matchedKeyword) 
    ? categoryResolution.matchedKeyword 
    : cleanItem;

  const recordPayload = {
    item: finalItem,
    type,
    amount,
    category: resolvedCategory,
    account,
    platform,
    recorder
  };

  // 7. บันทึกลง Ledger ท้องถิ่นทันที (รับประกันความรวดเร็วและไม่ล้มเหลว)
  const savedTx = recordLocalTransaction(recordPayload);

  // 8. บันทึกลง Google Sheets (ถ้ามีการตั้งค่า credentials ไว้)
  let sheetsStatusNote = '';
  try {
    if (process.env.GOOGLE_SPREADSHEET_ID && 
        (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)) {
      await saveRecord(recordPayload);
      sheetsStatusNote = ' ☁️ (บันทึกลง Google Sheets สำเร็จ)';
    }
  } catch (sheetsErr) {
    console.warn('[CHAT] Google Sheets save warning:', sheetsErr.message);
    sheetsStatusNote = ' 💡 (บันทึกในระบบแชทแล้ว - เชื่อมต่อ Google Sheets ได้ในหน้าตั้งค่า)';
  }

  // 9. สร้างการ์ดยืนยันรายการรูปภาพ (PNG Visual Receipt Card)
  let cardUrl = null;
  if (req) {
    try {
      cardUrl = cacheCardPayload('transaction', {
        ...recordPayload,
        date: savedTx.date + ' ' + savedTx.time
      }, req);
    } catch (e) {
      console.warn('[CARD GENERATION WARN]', e.message);
    }
  }

  // 10. สร้างข้อความตอบกลับ
  const amountFormatted = amount.toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const isIncome = type === 'รายรับ';
  const icon = isIncome ? '🟢' : '🔴';
  const typeTitle = isIncome ? 'บันทึกรายรับสำเร็จ' : 'บันทึกรายจ่ายสำเร็จ';

  const text = `${icon} **${typeTitle}**${sheetsStatusNote}\n\n` +
               `📝 **รายการ:** ${finalItem}\n` +
               `💵 **จำนวนเงิน:** **${amountFormatted} บาท**\n` +
               `🏷️ **หมวดหมู่:** ${resolvedCategory}\n` +
               `💳 **บัญชี:** ${account}\n` +
               `🕒 **เวลา:** ${savedTx.date} ${savedTx.time}`;

  return {
    success: true,
    text,
    cardImageUrl: cardUrl,
    intent: isIncome ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย',
    data: {
      ...savedTx,
      categoryMethod: categoryResolution.method,
      matchedKeyword: categoryResolution.matchedKeyword
    },
    quickReplies: ['เช็คยอดคงเหลือ', 'กินกาแฟ 65', 'เติมน้ำมัน 800', 'บันทึกรายรับ']
  };
}

/**
 * ดึงประวัติรายการล่าสุดจาก Ledger
 */
function getRecentTransactions(limit = 20) {
  const ledger = readLedger();
  return (ledger.transactions || []).slice(0, limit);
}

/**
 * ล้างข้อมูลประวัติใน Ledger (สำหรับรีเซ็ตการทดสอบ)
 */
function resetLedger() {
  writeLedger(DEFAULT_LEDGER);
  return { success: true, message: 'รีเซ็ตข้อมูลการแชทเรียบร้อยแล้ว' };
}

/**
 * แก้ไขหมวดหมู่ของรายการใน Ledger
 */
function updateTransactionCategory(txId, newCategory) {
  const ledger = readLedger();
  const tx = (ledger.transactions || []).find(t => t.id === txId);
  if (!tx) {
    return { success: false, message: 'ไม่พบรายการที่ต้องการแก้ไข' };
  }
  const oldCategory = tx.category;
  tx.category = newCategory;
  writeLedger(ledger);
  return { success: true, tx, oldCategory, newCategory };
}

module.exports = {
  processChatMessage,
  calculateLocalBalanceSummary,
  getBalanceSummary: calculateLocalBalanceSummary,
  recordLocalTransaction,
  recordTransaction: recordLocalTransaction,
  getRecentTransactions,
  resetLedger,
  readLedger,
  updateTransactionCategory
};
