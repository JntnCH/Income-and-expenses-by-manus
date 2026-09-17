/**
 * Dialogflow Entity Service
 * บริการเชื่อมต่อ Dialogflow ES API สำหรับดึง, เพิ่ม, และแก้ไข Entities (หมวดหมู่)
 */

const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { parsePrivateKey, parseServiceAccountJson } = require('../utils/credentialsParser');

let cachedSessionProjectId = null;

/**
 * ดึง Project ID สำหรับ Dialogflow
 */
function getProjectId() {
  if (process.env.DIALOGFLOW_PROJECT_ID) {
    return process.env.DIALOGFLOW_PROJECT_ID.trim();
  }
  if (process.env.GOOGLE_PROJECT_ID) {
    return process.env.GOOGLE_PROJECT_ID.trim();
  }
  if (process.env.GCP_PROJECT_ID) {
    return process.env.GCP_PROJECT_ID.trim();
  }

  // ดึงจาก GOOGLE_SERVICE_ACCOUNT_JSON
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const creds = parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      if (creds.project_id) return creds.project_id;
    } catch (e) {
      // ignore
    }
  }

  // ดึงจาก GOOGLE_SERVICE_ACCOUNT_EMAIL (e.g. name@project-id.iam.gserviceaccount.com)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.trim();
    const match = email.match(/@([^.]+)\.iam\.gserviceaccount\.com/);
    if (match && match[1]) return match[1];
  }

  // fallback จาก session ที่เก็บไว้
  if (cachedSessionProjectId) {
    return cachedSessionProjectId;
  }

  return null;
}

/**
 * บันทึก Project ID ที่ตรวจพบจาก Webhook Request
 */
function rememberProjectIdFromSession(sessionString) {
  if (!sessionString || typeof sessionString !== 'string') return;
  // รูปแบบ session: projects/{projectId}/agent/sessions/{sessionId}
  const match = sessionString.match(/projects\/([^/]+)\/agent/);
  if (match && match[1]) {
    cachedSessionProjectId = match[1];
    console.log(`[DIALOGFLOW] Remembered project ID from session: ${cachedSessionProjectId}`);
  }
}

/**
 * สร้าง Google Auth JWT Client สำหรับ Dialogflow API
 */
function getAuthClient() {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        const credentials = parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        return new JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: [
            'https://www.googleapis.com/auth/dialogflow',
            'https://www.googleapis.com/auth/cloud-platform'
          ],
        });
      } catch (e) {
        console.error('[DIALOGFLOW AUTH] Failed to parse JSON credentials:', e.message);
      }
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !privateKeyRaw) {
      throw new Error('ไม่พบข้อมูล GOOGLE_SERVICE_ACCOUNT_EMAIL และ GOOGLE_PRIVATE_KEY ในการตั้งค่า');
    }

    const privateKey = parsePrivateKey(privateKeyRaw);

    return new JWT({
      email,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/dialogflow',
        'https://www.googleapis.com/auth/cloud-platform'
      ],
    });
  } catch (error) {
    console.error('[DIALOGFLOW AUTH ERROR]', error.message);
    throw error;
  }
}

/**
 * ดึง Dialogflow API Client
 */
function getDialogflow() {
  const auth = getAuthClient();
  return google.dialogflow({ version: 'v2', auth });
}

/**
 * ดึงรายการ Entity Types ทั้งหมดใน Dialogflow Agent
 */
async function listEntityTypes() {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('ไม่พบ Dialogflow Project ID (กรุณาระบุ DIALOGFLOW_PROJECT_ID หรือใช้ Service Account ที่มี project_id)');
  }

  const dialogflow = getDialogflow();
  const parent = `projects/${projectId}/agent`;

  console.log(`[DIALOGFLOW] Fetching entity types for ${parent}...`);
  const response = await dialogflow.projects.agent.entityTypes.list({
    parent,
    pageSize: 100
  });

  const entityTypes = response.data.entityTypes || [];
  return entityTypes.map(et => ({
    name: et.name,
    displayName: et.displayName,
    kind: et.kind,
    autoExpansionMode: et.autoExpansionMode,
    entitiesCount: et.entities ? et.entities.length : 0
  }));
}

/**
 * ดึงข้อมูล Entity Type ตัวหนึ่งอย่างละเอียด (พร้อม Entity entries และ Synonyms)
 */
async function getEntityType(displayNameOrFullName) {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('ไม่พบ Dialogflow Project ID');
  }

  const dialogflow = getDialogflow();
  let fullName = displayNameOrFullName;

  // ถ้าส่งมาแค่ displayName เช่น 'Expense-category' ให้ค้นหา fullName ก่อน
  if (!fullName.startsWith('projects/')) {
    const list = await listEntityTypes();
    const found = list.find(et => et.displayName.toLowerCase() === displayNameOrFullName.toLowerCase());
    if (!found) {
      throw new Error(`ไม่พบ Entity Type ชื่อ "${displayNameOrFullName}" ใน Dialogflow Agent`);
    }
    fullName = found.name;
  }

  const response = await dialogflow.projects.agent.entityTypes.get({
    name: fullName
  });

  return response.data;
}

/**
 * สร้าง Entity Type ใหม่ใน Dialogflow
 */
async function createEntityType(displayName, entities = []) {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('ไม่พบ Dialogflow Project ID');
  }

  const dialogflow = getDialogflow();
  const parent = `projects/${projectId}/agent`;

  const requestBody = {
    displayName,
    kind: 'KIND_MAP',
    entities: entities.map(e => ({
      value: e.value || e.name,
      synonyms: Array.isArray(e.synonyms) ? e.synonyms : [e.value || e.name]
    }))
  };

  const response = await dialogflow.projects.agent.entityTypes.create({
    parent,
    requestBody
  });

  return response.data;
}

/**
 * เพิ่มหรือแก้ไขหมวดหมู่ (Entity Entry) ใน Entity Type
 * @param {string} displayNameOrFullName - ชื่อ Entity Type เช่น 'Expense-category'
 * @param {string} value - ค่าหลักของหมวดหมู่ เช่น 'อาหารและเครื่องดื่ม'
 * @param {string[]} synonyms - คำพ้องความหมาย เช่น ['ข้าว', 'กาแฟ', 'ขนม']
 */
async function addOrUpdateEntityEntry(displayNameOrFullName, value, synonyms = []) {
  const entityType = await getEntityType(displayNameOrFullName);
  const currentEntities = entityType.entities || [];

  // ทำความสะอาด synonyms: ต้องมีค่า value อยู่ใน synonyms เสมอตามข้อกำหนด Dialogflow
  const cleanSynonyms = Array.from(new Set([
    value,
    ...synonyms.map(s => String(s).trim()).filter(Boolean)
  ]));

  // ตรวจสอบว่ามี value นี้อยู่แล้วหรือไม่
  const existingIndex = currentEntities.findIndex(
    e => e.value.toLowerCase() === value.toLowerCase()
  );

  if (existingIndex >= 0) {
    // รวม synonyms เดิมกับใหม่
    const mergedSynonyms = Array.from(new Set([
      ...currentEntities[existingIndex].synonyms,
      ...cleanSynonyms
    ]));
    currentEntities[existingIndex].synonyms = mergedSynonyms;
  } else {
    // เพิ่ม entity ใหม่
    currentEntities.push({
      value,
      synonyms: cleanSynonyms
    });
  }

  const dialogflow = getDialogflow();
  const response = await dialogflow.projects.agent.entityTypes.patch({
    name: entityType.name,
    updateMask: 'entities',
    requestBody: {
      entities: currentEntities
    }
  });

  return {
    success: true,
    entityType: response.data.displayName,
    value,
    synonyms: cleanSynonyms
  };
}

/**
 * ลบหมวดหมู่ (Entity Entry) ออกจาก Entity Type
 */
async function deleteEntityEntry(displayNameOrFullName, value) {
  const entityType = await getEntityType(displayNameOrFullName);
  const currentEntities = entityType.entities || [];

  const updatedEntities = currentEntities.filter(
    e => e.value.toLowerCase() !== value.toLowerCase()
  );

  if (updatedEntities.length === currentEntities.length) {
    return { success: false, message: `ไม่พบหมวดหมู่ "${value}" ใน ${entityType.displayName}` };
  }

  const dialogflow = getDialogflow();
  await dialogflow.projects.agent.entityTypes.patch({
    name: entityType.name,
    updateMask: 'entities',
    requestBody: {
      entities: updatedEntities
    }
  });

  return { success: true, message: `ลบหมวดหมู่ "${value}" สำเร็จ` };
}

/**
 * ส่งหมวดหมู่ในระบบ (Local Categories) ขึ้นไปอัปเดต Entity Type ใน Dialogflow
 */
async function pushCategoriesToDialogflow(displayName, categories) {
  let entityType;
  try {
    entityType = await getEntityType(displayName);
  } catch (err) {
    // ถ้ายังไม่มี Entity Type ให้สร้างใหม่
    console.log(`[DIALOGFLOW] Entity Type ${displayName} not found, creating new one...`);
    entityType = await createEntityType(displayName, []);
  }

  const dialogflowEntities = categories.map(cat => ({
    value: cat.name,
    synonyms: Array.from(new Set([
      cat.name,
      ...(cat.synonyms || []).map(s => String(s).trim()).filter(Boolean)
    ]))
  }));

  const dialogflow = getDialogflow();
  const response = await dialogflow.projects.agent.entityTypes.patch({
    name: entityType.name,
    updateMask: 'entities',
    requestBody: {
      entities: dialogflowEntities
    }
  });

  return {
    success: true,
    displayName: response.data.displayName,
    count: dialogflowEntities.length
  };
}

module.exports = {
  getProjectId,
  rememberProjectIdFromSession,
  listEntityTypes,
  getEntityType,
  createEntityType,
  addOrUpdateEntityEntry,
  deleteEntityEntry,
  pushCategoriesToDialogflow
};
