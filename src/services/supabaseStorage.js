const DEFAULT_BUCKET = 'income-expense-images';

function getSupabaseBaseUrl() {
  const rawUrl = String(process.env.SUPABASE_URL || '').trim();
  if (!rawUrl) return '';

  return rawUrl
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

function getStorageKey() {
  // Server-only keys are required for Storage uploads from the webhook.
  // The public key is intentionally not used unless explicitly opted in.
  return process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    (process.env.SUPABASE_ALLOW_PUBLIC_UPLOAD === 'true' ? process.env.SUPABASE_KEY : '');
}

function encodeObjectPath(objectPath) {
  return String(objectPath)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function getPublicObjectUrl(bucket, objectPath) {
  const baseUrl = getSupabaseBaseUrl();
  if (!baseUrl) return '';

  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`;
}

async function uploadPublicObject(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Storage upload requires a non-empty Buffer');
  }

  const baseUrl = getSupabaseBaseUrl();
  const storageKey = getStorageKey();
  const bucket = options.bucket || process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;
  const objectPath = options.objectPath;
  const contentType = options.contentType || 'application/octet-stream';

  if (!baseUrl) {
    throw new Error('SUPABASE_URL is not configured');
  }
  if (!storageKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is not configured');
  }
  if (!objectPath) {
    throw new Error('Storage objectPath is required');
  }

  const uploadUrl = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeObjectPath(objectPath)}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: storageKey,
      Authorization: `Bearer ${storageKey}`,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'x-upsert': 'true'
    },
    body: buffer
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase Storage upload failed (${response.status}): ${responseText.slice(0, 300)}`);
  }

  return {
    bucket,
    objectPath,
    contentType,
    url: getPublicObjectUrl(bucket, objectPath)
  };
}

function isStorageConfigured() {
  return Boolean(getSupabaseBaseUrl() && getStorageKey());
}

module.exports = {
  DEFAULT_BUCKET,
  getSupabaseBaseUrl,
  getPublicObjectUrl,
  isStorageConfigured,
  uploadPublicObject
};
