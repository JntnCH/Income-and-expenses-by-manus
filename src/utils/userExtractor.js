/**
 * User Extractor Utility
 * ดึงข้อมูลผู้ใช้จาก Dialogflow originalDetectIntentRequest
 * รองรับ: Telegram, LINE, Facebook Messenger
 */

/**
 * ดึงข้อมูลผู้ใช้จาก Dialogflow request body
 * @param {Object} body - Dialogflow Webhook request body
 * @returns {Object} { userId, displayName, platform, source }
 */
function extractUser(body) {
  const originalRequest = body?.originalDetectIntentRequest || {};
  const source = originalRequest.source || 'unknown';
  const payload = originalRequest.payload || {};
  
  switch (source) {
    case 'telegram':
      return extractTelegramUser(payload);
      
    case 'line':
      return extractLINEUser(payload);
      
    case 'facebook':
      return extractFacebookUser(payload);
      
    case 'ACTIONS_ON_GOOGLE':
      return extractGoogleUser(payload);
      
    default:
      // fallback: ลองดึงจาก session
      return extractFromSession(body);
  }
}

// ============================================================
// Telegram
// ============================================================
function extractTelegramUser(payload) {
  const from = payload?.data?.from || payload?.from || {};
  const chat = payload?.data?.chat || {};
  
  const firstName = from.first_name || '';
  const lastName = from.last_name || '';
  const username = from.username || '';
  const userId = String(from.id || chat.id || '');
  
  const displayName = username ?
    `@${username}` :
    [firstName, lastName].filter(Boolean).join(' ') || 'Telegram User';
  
  return {
    userId,
    displayName,
    platform: 'Telegram',
    source: 'telegram',
    raw: from
  };
}

// ============================================================
// LINE
// ============================================================
function extractLINEUser(payload) {
  // LINE ส่งข้อมูลผ่าน events array
  const events = payload?.events || [];
  const event = events[0] || payload;
  const source = event?.source || {};
  
  const userId = source.userId || source.groupId || source.roomId || '';
  
  // LINE ไม่ส่ง displayName ใน webhook โดยตรง ต้องเรียก LINE API ภายหลัง
  const displayName = source.userId ?
    `LINE:${source.userId.substring(0, 8)}...` :
    'LINE User';
  
  return {
    userId,
    displayName,
    platform: 'LINE',
    source: 'line',
    raw: source
  };
}

// ============================================================
// Facebook Messenger
// ============================================================
function extractFacebookUser(payload) {
  const entry = payload?.entry?.[0] || {};
  const messaging = entry?.messaging?.[0] || {};
  const sender = messaging?.sender || payload?.sender || {};
  
  const userId = String(sender.id || '');
  
  // Facebook ไม่ส่งชื่อใน webhook โดยตรง
  const displayName = userId ?
    `FB:${userId.substring(0, 8)}...` :
    'Facebook User';
  
  return {
    userId,
    displayName,
    platform: 'Facebook',
    source: 'facebook',
    raw: sender
  };
}

// ============================================================
// Google Assistant
// ============================================================
function extractGoogleUser(payload) {
  const user = payload?.user || {};
  const userId = user.userId || '';
  const displayName = user.profile?.displayName || 'Google User';
  
  return {
    userId,
    displayName,
    platform: 'Google',
    source: 'google',
    raw: user
  };
}

// ============================================================
// Fallback: ดึงจาก Dialogflow session
// ============================================================
function extractFromSession(body) {
  const session = body?.session || '';
  const sessionId = session.split('/').pop() || 'unknown';
  
  return {
    userId: sessionId,
    displayName: `User:${sessionId.substring(0, 8)}`,
    platform: 'Unknown',
    source: 'unknown',
    raw: {}
  };
}

/**
 * สร้าง label สำหรับแสดงใน Google Sheets
 * แก้ไขแล้ว: ไม่ใส่ [Platform] เพราะมีคอลัมน์ "ช่องทาง" แยกอยู่แล้ว
 * @param {Object} userInfo - ข้อมูลผู้ใช้จาก extractUser()
 * @returns {string} ชื่อผู้บันทึกสำหรับ Google Sheets
 */
function formatUserLabel(userInfo) {
  if (!userInfo) return 'ไม่ระบุ';
  
  // แสดงเฉพาะ displayName (เช่น @Jntn2026)
  return userInfo.displayName || 'ไม่ระบุ';
}

module.exports = { extractUser, formatUserLabel };