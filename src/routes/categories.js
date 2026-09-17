/**
 * Categories & Dialogflow Entities API Routes
 * จัดการหมวดหมู่ คำพ้อง กฎการแก้ไข และเชื่อมต่อกับ Dialogflow Entity Types
 */

const express = require('express');
const router = express.Router();
const categoryManager = require('../services/categoryManager');
const dialogflowEntityService = require('../services/dialogflowEntityService');

/**
 * GET /api/categories
 * ดึงหมวดหมู่ทั้งหมด กฎการแก้ไข และการตั้งค่า
 */
router.get('/', (req, res) => {
  try {
    const data = categoryManager.getAllCategories();
    res.json({
      success: true,
      data: {
        ...data,
        expenseCategories: data.categories?.expense || [],
        incomeCategories: data.categories?.income || [],
        correctionRules: data.correctionRules || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/categories
 * เพิ่มหรืออัปเดตหมวดหมู่
 * Body: { type: 'expense'|'income', name: string, synonyms: string[]|string }
 */
router.post('/', (req, res) => {
  try {
    const { type = 'expense', name, synonyms, id } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อหมวดหมู่' });
    }

    const result = categoryManager.addOrUpdateCategory(type, { id, name, synonyms });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/categories/:type/:name
 * ลบหมวดหมู่
 */
router.delete('/:type/:name', (req, res) => {
  try {
    const { type, name } = req.params;
    const result = categoryManager.deleteCategory(type, decodeURIComponent(name));
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/categories/rules
 * เพิ่มกฎการแก้ไขหมวดหมู่เวลาบันทึกไม่ตรง
 * Body: { keyword: string, targetCategory: string, type: 'รายจ่าย'|'รายรับ' }
 */
router.post('/rules', (req, res) => {
  try {
    const { keyword, targetCategory, type } = req.body;
    const result = categoryManager.addCorrectionRule({ keyword, targetCategory, type });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/categories/rules/:id
 * ลบกฎการแก้ไขหมวดหมู่
 */
router.delete('/rules/:id', (req, res) => {
  try {
    const result = categoryManager.deleteCorrectionRule(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/categories/test
 * ทดสอบการวิเคราะห์และแก้ไขหมวดหมู่
 * Body: { text: string, item?: string, rawCategory?: string, type?: 'รายจ่าย'|'รายรับ' }
 */
router.post('/test', (req, res) => {
  try {
    const { text = '', item = '', rawCategory = '', type = 'รายจ่าย' } = req.body;
    const result = categoryManager.resolveCategory({
      item: item || text,
      category: rawCategory,
      type,
      queryText: text
    });

    res.json({
      success: true,
      input: { text, item, rawCategory, type },
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// DIALOGFLOW ENTITY INTEGRATION ENDPOINTS
// ============================================================

/**
 * GET /api/categories/dialogflow/status
 * ตรวจสอบสถานะการเชื่อมต่อ Dialogflow และ Project ID
 */
router.get('/dialogflow/status', (req, res) => {
  try {
    const projectId = dialogflowEntityService.getProjectId();
    const hasCredentials = Boolean(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON || 
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
    );

    res.json({
      success: true,
      connected: Boolean(projectId && hasCredentials),
      projectId: projectId || null,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/categories/dialogflow/entity-types
 * ดึงรายการ Entity Types ทั้งหมดจาก Dialogflow Agent
 */
router.get('/dialogflow/entity-types', async (req, res) => {
  try {
    const entityTypes = await dialogflowEntityService.listEntityTypes();
    res.json({
      success: true,
      count: entityTypes.length,
      entityTypes
    });
  } catch (err) {
    console.error('[DIALOGFLOW ENTITY TYPES ERROR]', err.message);
    res.status(500).json({
      success: false,
      error: `ไม่สามารถดึงข้อมูล Entity จาก Dialogflow ได้: ${err.message}`
    });
  }
});

/**
 * GET /api/categories/dialogflow/entity-types/:name
 * ดึงรายละเอียดของ Entity Type หนึ่ง (รวมหมวดหมู่และ synonyms ทั้งหมด)
 */
router.get('/dialogflow/entity-types/:name', async (req, res) => {
  try {
    const entityType = await dialogflowEntityService.getEntityType(decodeURIComponent(req.params.name));
    res.json({
      success: true,
      entityType
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/categories/dialogflow/entity-types/:name/entries
 * เพิ่มหรืออัปเดต Entity Entry (หมวดหมู่และคำพ้อง) ใน Dialogflow โดยตรง
 * Body: { value: string, synonyms: string[] }
 */
router.post('/dialogflow/entity-types/:name/entries', async (req, res) => {
  try {
    const { value, synonyms = [] } = req.body;
    if (!value) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุ value (ชื่อหมวดหมู่)' });
    }

    const result = await dialogflowEntityService.addOrUpdateEntityEntry(
      decodeURIComponent(req.params.name),
      value,
      synonyms
    );

    // ซิงค์มายัง local ด้วยเพื่อความรวดเร็ว
    const isIncome = req.params.name.toLowerCase().includes('income');
    categoryManager.addOrUpdateCategory(isIncome ? 'income' : 'expense', {
      name: value,
      synonyms
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `ไม่สามารถเพิ่มข้อมูลใน Dialogflow ได้: ${err.message}`
    });
  }
});

/**
 * DELETE /api/categories/dialogflow/entity-types/:name/entries/:value
 * ลบ Entity Entry ออกจาก Dialogflow
 */
router.delete('/dialogflow/entity-types/:name/entries/:value', async (req, res) => {
  try {
    const result = await dialogflowEntityService.deleteEntityEntry(
      decodeURIComponent(req.params.name),
      decodeURIComponent(req.params.value)
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/categories/dialogflow/sync-from
 * ดึง Entities จาก Dialogflow มาบันทึกลงในระบบหมวดหมู่ท้องถิ่น
 * Body: { entityType: 'Expense-category'|'Income_category', type: 'expense'|'income' }
 */
router.post('/dialogflow/sync-from', async (req, res) => {
  try {
    const { entityType = 'Expense-category', type = 'expense' } = req.body;
    const result = await categoryManager.importFromDialogflow(entityType, type);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `ดึงหมวดหมู่จาก Dialogflow ล้มเหลว: ${err.message}`
    });
  }
});

/**
 * POST /api/categories/dialogflow/sync-to
 * ส่งหมวดหมู่ในระบบขึ้นไปอัปเดตยัง Dialogflow Entity Type
 * Body: { entityType: 'Expense-category'|'Income_category', type: 'expense'|'income' }
 */
router.post('/dialogflow/sync-to', async (req, res) => {
  try {
    const { entityType = 'Expense-category', type = 'expense' } = req.body;
    const result = await categoryManager.exportToDialogflow(entityType, type);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `ส่งหมวดหมู่ขึ้น Dialogflow ล้มเหลว: ${err.message}`
    });
  }
});

module.exports = router;
