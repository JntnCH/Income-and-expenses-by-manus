/**
 * Category Manager & Intelligent Category Normalizer
 * จัดการหมวดหมู่ คำพ้องความหมาย (Synonyms) กฎการแก้ไข (Rules)
 * และระบบตรวจจับ/แก้ไขหมวดหมู่อัตโนมัติเมื่อบันทึกข้อมูลไม่ตรง
 */

const fs = require('fs');
const path = require('path');
const dialogflowEntityService = require('./dialogflowEntityService');

const CATEGORIES_FILE = path.join(__dirname, '../../data/categories.json');

// Memory Cache
let categoryData = null;

/**
 * โหลดข้อมูลหมวดหมู่จากไฟล์
 */
function loadCategoryData() {
  try {
    if (fs.existsSync(CATEGORIES_FILE)) {
      const raw = fs.readFileSync(CATEGORIES_FILE, 'utf-8');
      categoryData = JSON.parse(raw);
    } else {
      categoryData = getDefaultCategoryData();
      saveCategoryData();
    }
  } catch (err) {
    console.error('[CATEGORY MANAGER] Error reading categories file:', err.message);
    categoryData = getDefaultCategoryData();
  }
  return categoryData;
}

/**
 * บันทึกข้อมูลหมวดหมู่ลงไฟล์
 */
function saveCategoryData() {
  try {
    const dir = path.dirname(CATEGORIES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    categoryData.updatedAt = new Date().toISOString();
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categoryData, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[CATEGORY MANAGER] Error saving categories file:', err.message);
    return false;
  }
}

/**
 * ข้อมูลหมวดหมู่เริ่มต้น (Fallback Defaults)
 */
function getDefaultCategoryData() {
  return {
    categories: {
      expense: [
        {
          id: 'exp_food',
          name: 'อาหารและเครื่องดื่ม',
          synonyms: ['อาหาร', 'เครื่องดื่ม', 'ข้าว', 'กาแฟ', 'ขนม', 'น้ำ', 'ชาบู', 'หมูกระทะ', 'ก๋วยเตี๋ยว', 'ส้มตำ', 'ข้าวมันไก่', 'ข้าวผัด', 'ชานม', 'ชานมไข่มุก', 'ข้าวแกง', 'เบียร์', 'เหล้า']
        },
        {
          id: 'exp_transport',
          name: 'การเดินทาง',
          synonyms: ['การเดินทาง', 'น้ำมัน', 'ค่ารถ', 'bts', 'mrt', 'แท็กซี่', 'grab', 'วิน', 'ทางด่วน', 'รถเมล์', 'ค่าตั๋ว', 'เติมน้ำมัน', 'bolt']
        },
        {
          id: 'exp_shopping',
          name: 'ของใช้ / ช้อปปิ้ง',
          synonyms: ['ของใช้', 'สบู่', 'แชมพู', 'ยาสระผม', 'ยาสีฟัน', 'เซเว่น', '7-11', 'shopee', 'lazada', 'เสื้อผ้า', 'รองเท้า', 'กระเป๋า']
        },
        {
          id: 'exp_housing',
          name: 'ที่อยู่อาศัย / บิล',
          synonyms: ['ค่าห้อง', 'ค่าเช่า', 'ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต', 'อินเทอร์เน็ต', 'wifi', 'ค่าส่วนกลาง', 'โทรศัพท์', 'ค่าโทร', 'ค่าบ้าน']
        },
        {
          id: 'exp_health',
          name: 'สุขภาพ / การแพทย์',
          synonyms: ['ยา', 'ค่ายา', 'หมอ', 'โรงพยาบาล', 'คลินิก', 'ฟัน', 'ขูดหินปูน', 'ตรวจสุขภาพ']
        },
        {
          id: 'exp_entertainment',
          name: 'ความบันเทิง',
          synonyms: ['ดูหนัง', 'ตั๋วหนัง', 'โรงหนัง', 'netflix', 'spotify', 'youtube', 'เกม', 'เติมเกม', 'คอนเสิร์ต']
        },
        {
          id: 'exp_general',
          name: 'ทั่วไป',
          synonyms: ['ของขวัญ', 'ทำบุญ', 'อื่นๆ', 'เบ็ดเตล็ด', 'ทั่วไป']
        }
      ],
      income: [
        {
          id: 'inc_salary',
          name: 'เงินเดือน',
          synonyms: ['เงินเดือน', 'salary', 'เงินประจำ', 'ค่าจ้าง']
        },
        {
          id: 'inc_freelance',
          name: 'งานพิเศษ / ฟรีแลนซ์',
          synonyms: ['ฟรีแลนซ์', 'รับจ้าง', 'ค่าจ้าง', 'freelance', 'ค่าสอน', 'นายหน้า']
        },
        {
          id: 'inc_business',
          name: 'ธุรกิจ / ค้าขาย',
          synonyms: ['ขายของ', 'กำไร', 'ยอดขาย', 'รายได้จากร้าน']
        },
        {
          id: 'inc_general',
          name: 'รายได้ทั่วไป',
          synonyms: ['เงินเข้า', 'รับเงิน', 'อื่นๆ', 'รายได้ทั่วไป']
        }
      ]
    },
    correctionRules: [
      { id: 'r1', keyword: 'เซเว่น', targetCategory: 'อาหารและเครื่องดื่ม', type: 'รายจ่าย' },
      { id: 'r2', keyword: '7-11', targetCategory: 'อาหารและเครื่องดื่ม', type: 'รายจ่าย' },
      { id: 'r3', keyword: 'ค่าห้อง', targetCategory: 'ที่อยู่อาศัย / บิล', type: 'รายจ่าย' },
      { id: 'r4', keyword: 'ค่าเน็ต', targetCategory: 'ที่อยู่อาศัย / บิล', type: 'รายจ่าย' },
      { id: 'r5', keyword: 'น้ำมัน', targetCategory: 'การเดินทาง', type: 'รายจ่าย' }
    ],
    dialogflowEntityMap: {
      expenseEntityType: 'Expense-category',
      incomeEntityType: 'Income_category'
    }
  };
}

/**
 * ดึงหมวดหมู่ทั้งหมด
 */
function getAllCategories() {
  if (!categoryData) loadCategoryData();
  return categoryData;
}

/**
 * ดึงรายการหมวดหมู่ตามประเภท ('expense' หรือ 'income')
 */
function getCategoriesByType(type = 'expense') {
  if (!categoryData) loadCategoryData();
  const normalizedType = type === 'รายรับ' || type === 'income' ? 'income' : 'expense';
  return categoryData.categories[normalizedType] || [];
}

/**
 * เพิ่มหรือแก้ไขหมวดหมู่
 */
function addOrUpdateCategory(type, categoryPayload) {
  if (!categoryData) loadCategoryData();
  const normalizedType = type === 'รายรับ' || type === 'income' ? 'income' : 'expense';
  const categories = categoryData.categories[normalizedType];

  const name = String(categoryPayload.name || '').trim();
  if (!name) {
    throw new Error('กรุณาระบุชื่อหมวดหมู่');
  }

  const rawSynonyms = Array.isArray(categoryPayload.synonyms)
    ? categoryPayload.synonyms
    : String(categoryPayload.synonyms || '').split(',').map(s => s.trim()).filter(Boolean);

  const cleanSynonyms = Array.from(new Set([name, ...rawSynonyms]));

  const existingIndex = categories.findIndex(
    c => c.name.toLowerCase() === name.toLowerCase() || (categoryPayload.id && c.id === categoryPayload.id)
  );

  if (existingIndex >= 0) {
    categories[existingIndex].name = name;
    categories[existingIndex].synonyms = cleanSynonyms;
  } else {
    categories.push({
      id: `${normalizedType}_${Date.now()}`,
      name,
      synonyms: cleanSynonyms
    });
  }

  saveCategoryData();
  return { success: true, name, synonyms: cleanSynonyms, type: normalizedType };
}

/**
 * ลบหมวดหมู่
 */
function deleteCategory(type, nameOrId) {
  if (!categoryData) loadCategoryData();
  const normalizedType = type === 'รายรับ' || type === 'income' ? 'income' : 'expense';
  const categories = categoryData.categories[normalizedType];

  const initialLength = categories.length;
  categoryData.categories[normalizedType] = categories.filter(
    c => c.name.toLowerCase() !== nameOrId.toLowerCase() && c.id !== nameOrId
  );

  if (categoryData.categories[normalizedType].length === initialLength) {
    return { success: false, message: `ไม่พบหมวดหมู่ "${nameOrId}"` };
  }

  saveCategoryData();
  return { success: true, message: `ลบหมวดหมู่ "${nameOrId}" เรียบร้อยแล้ว` };
}

/**
 * เพิ่มกฎการแก้ไขหมวดหมู่อัตโนมัติ (Correction Rule)
 * เช่น "เมื่อพบคำว่า 'ชาบู' ให้บันทึกเป็น 'อาหารและเครื่องดื่ม'"
 */
function addCorrectionRule({ keyword, targetCategory, type = 'รายจ่าย' }) {
  if (!categoryData) loadCategoryData();
  if (!keyword || !targetCategory) {
    throw new Error('กรุณาระบุคีย์เวิร์ด (keyword) และหมวดหมู่เป้าหมาย (targetCategory)');
  }

  const ruleType = type === 'รายรับ' || type === 'income' ? 'รายรับ' : 'รายจ่าย';
  const cleanKeyword = keyword.trim().toLowerCase();

  // ลบกฎซ้ำเดิมถ้ามี
  categoryData.correctionRules = categoryData.correctionRules.filter(
    r => !(r.keyword.toLowerCase() === cleanKeyword && r.type === ruleType)
  );

  const newRule = {
    id: `rule_${Date.now()}`,
    keyword: keyword.trim(),
    targetCategory: targetCategory.trim(),
    type: ruleType
  };

  categoryData.correctionRules.unshift(newRule);
  saveCategoryData();
  return { success: true, rule: newRule };
}

/**
 * ลบกฎการแก้ไขหมวดหมู่
 */
function deleteCorrectionRule(ruleId) {
  if (!categoryData) loadCategoryData();
  const initialLength = categoryData.correctionRules.length;
  categoryData.correctionRules = categoryData.correctionRules.filter(r => r.id !== ruleId);

  if (categoryData.correctionRules.length === initialLength) {
    return { success: false, message: 'ไม่พบกฎที่ต้องการลบ' };
  }

  saveCategoryData();
  return { success: true, message: 'ลบกฎการแก้ไขเรียบร้อยแล้ว' };
}

// ============================================================
// RESOLVER ENGINE: แก้ไขหมวดหมู่เวลาบันทึกข้อมูลไม่ตรง
// ============================================================

/**
 * วิเคราะห์และแก้ไขหมวดหมู่อัตโนมัติ ป้องกันการบันทึกหมวดหมู่ไม่ตรง
 * 
 * ลำดับการตรวจสอบ:
 * 1. กฎการแก้ไขแบบกำหนดเอง (Custom Correction Rules)
 * 2. ค้นหาคำพ้องความหมาย (Synonyms) ในชื่อรายการ (item)
 * 3. ค้นหาคำพ้องความหมาย (Synonyms) ในข้อความผู้ใช้ (queryText)
 * 4. ตรวจสอบว่าหมวดหมู่เดิมตรงกับหมวดหมู่หรือคำพ้องที่มีอยู่หรือไม่
 * 5. Fallback Default
 * 
 * @param {Object} params
 * @param {string} params.item - ชื่อรายการ เช่น "คาปูชิโน่", "ข้าวมันไก่", "เติมน้ำมัน"
 * @param {string} params.category - หมวดหมู่ดิบที่ได้จาก Dialogflow เช่น "ทั่วไป" หรือ null
 * @param {string} params.type - 'รายจ่าย' หรือ 'รายรับ'
 * @param {string} params.queryText - ข้อความเต็มที่ผู้ใช้พิมพ์ เช่น "ซื้อส้มตำปูปลาร้า 80 บาท"
 * @returns {Object} { resolvedCategory, originalCategory, method, matchedKeyword }
 */
function resolveCategory({ item = '', category = '', type = 'รายจ่าย', queryText = '' }) {
  if (!categoryData) loadCategoryData();

  const isIncome = type === 'รายรับ' || type === 'income';
  const categoryType = isIncome ? 'income' : 'expense';
  const defaultCategory = isIncome ? 'รายได้ทั่วไป' : 'ทั่วไป';
  const targetTypeList = categoryData.categories[categoryType] || [];

  const rawCategory = (category || '').trim();
  const itemStr = (item || '').trim().toLowerCase();
  const queryStr = (queryText || '').trim().toLowerCase();

  // -------------------------------------------------------------
  // Step 1: ตรวจสอบ Custom Correction Rules ก่อนเสมอ
  // -------------------------------------------------------------
  const applicableRules = (categoryData.correctionRules || []).filter(
    r => (isIncome && r.type === 'รายรับ') || (!isIncome && r.type === 'รายจ่าย')
  );

  for (const rule of applicableRules) {
    const kw = rule.keyword.toLowerCase();
    if (itemStr.includes(kw) || queryStr.includes(kw)) {
      return {
        resolvedCategory: rule.targetCategory,
        originalCategory: rawCategory || defaultCategory,
        method: 'custom_rule',
        matchedKeyword: rule.keyword
      };
    }
  }

  // -------------------------------------------------------------
  // Step 2: ตรวจสอบคำพ้อง (Synonyms) ในชื่อรายการ (item)
  // -------------------------------------------------------------
  if (itemStr && itemStr !== 'ไม่ระบุ') {
    // เรียงหมวดหมู่และคำพ้องตามความยาวตัวอักษรมากไปน้อย เพื่อจับคู่คำที่เจาะจงที่สุดก่อน
    for (const cat of targetTypeList) {
      const sortedSynonyms = [...(cat.synonyms || [])].sort((a, b) => b.length - a.length);
      for (const syn of sortedSynonyms) {
        const synLower = syn.toLowerCase();
        if (itemStr.includes(synLower)) {
          return {
            resolvedCategory: cat.name,
            originalCategory: rawCategory || defaultCategory,
            method: 'item_synonym_match',
            matchedKeyword: syn
          };
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Step 3: ตรวจสอบคำพ้อง (Synonyms) ในประโยคเต็มที่ผู้ใช้พิมพ์ (queryText)
  // -------------------------------------------------------------
  if (queryStr) {
    for (const cat of targetTypeList) {
      const sortedSynonyms = [...(cat.synonyms || [])].sort((a, b) => b.length - a.length);
      for (const syn of sortedSynonyms) {
        const synLower = syn.toLowerCase();
        if (queryStr.includes(synLower)) {
          return {
            resolvedCategory: cat.name,
            originalCategory: rawCategory || defaultCategory,
            method: 'query_synonym_match',
            matchedKeyword: syn
          };
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Step 4: ถ้า Dialogflow ส่งหมวดหมู่มา และตรงกับชื่อหมวดหมู่ในระบบ
  // -------------------------------------------------------------
  if (rawCategory && rawCategory !== 'ทั่วไป' && rawCategory !== 'รายได้ทั่วไป' && rawCategory !== 'ไม่ระบุ') {
    // ตรวจสอบว่าตรงกับชื่อหมวดหมู่หลักหรือไม่
    const exactCat = targetTypeList.find(c => c.name.toLowerCase() === rawCategory.toLowerCase());
    if (exactCat) {
      return {
        resolvedCategory: exactCat.name,
        originalCategory: rawCategory,
        method: 'exact_category_match',
        matchedKeyword: exactCat.name
      };
    }

    // ตรวจสอบว่าตรงกับ synonym ของหมวดหมู่ใดหรือไม่
    for (const cat of targetTypeList) {
      const match = (cat.synonyms || []).find(s => s.toLowerCase() === rawCategory.toLowerCase());
      if (match) {
        return {
          resolvedCategory: cat.name,
          originalCategory: rawCategory,
          method: 'category_synonym_normalize',
          matchedKeyword: match
        };
      }
    }

    // ถ้า Dialogflow ส่งมาแล้วไม่มีในลิสต์ ให้ใช้ค่านั้นได้ถ้าไม่ใช่คำว่าง
    return {
      resolvedCategory: rawCategory,
      originalCategory: rawCategory,
      method: 'dialogflow_raw',
      matchedKeyword: null
    };
  }

  // -------------------------------------------------------------
  // Step 5: ไม่ตรงกับหมวดใดเลย -> ใช้หมวดเริ่มต้น
  // -------------------------------------------------------------
  return {
    resolvedCategory: defaultCategory,
    originalCategory: rawCategory || defaultCategory,
    method: 'fallback_default',
    matchedKeyword: null
  };
}

/**
 * นำเข้าหมวดหมู่จาก Dialogflow Entity Type มายังระบบ Local
 */
async function importFromDialogflow(entityTypeDisplayName = 'Expense-category', type = 'expense') {
  if (!categoryData) loadCategoryData();
  const normalizedType = type === 'รายรับ' || type === 'income' ? 'income' : 'expense';

  const entityType = await dialogflowEntityService.getEntityType(entityTypeDisplayName);
  const entities = entityType.entities || [];

  let importedCount = 0;
  for (const entity of entities) {
    const value = entity.value;
    const synonyms = entity.synonyms || [];
    addOrUpdateCategory(normalizedType, {
      name: value,
      synonyms
    });
    importedCount++;
  }

  saveCategoryData();
  return {
    success: true,
    entityType: entityType.displayName,
    importedCount,
    categories: categoryData.categories[normalizedType]
  };
}

/**
 * ส่งหมวดหมู่ในระบบขึ้นไปยัง Dialogflow Entity Type
 */
async function exportToDialogflow(entityTypeDisplayName = 'Expense-category', type = 'expense') {
  if (!categoryData) loadCategoryData();
  const normalizedType = type === 'รายรับ' || type === 'income' ? 'income' : 'expense';
  const categories = categoryData.categories[normalizedType] || [];

  const result = await dialogflowEntityService.pushCategoriesToDialogflow(
    entityTypeDisplayName,
    categories
  );

  return result;
}

module.exports = {
  loadCategoryData,
  saveCategoryData,
  getAllCategories,
  getCategoriesByType,
  addOrUpdateCategory,
  deleteCategory,
  addCorrectionRule,
  deleteCorrectionRule,
  resolveCategory,
  importFromDialogflow,
  exportToDialogflow
};
