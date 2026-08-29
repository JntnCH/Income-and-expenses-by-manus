const { Storage } = require('@google-cloud/storage');

const DEFAULT_BUCKET = 'income-expense-images';
let storageClient;

function getStorageClient() {
  if (!storageClient) {
    storageClient = new Storage();
  }
  return storageClient;
}

function getBucketName() {
  return String(process.env.GCS_IMAGE_BUCKET || DEFAULT_BUCKET).trim();
}

function getPublicObjectUrl(bucketName, objectPath) {
  const encodedPath = String(objectPath)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  return `https://storage.googleapis.com/${encodeURIComponent(bucketName)}/${encodedPath}`;
}

async function uploadPublicObject(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Cloud Storage upload requires a non-empty Buffer');
  }

  const bucketName = options.bucket || getBucketName();
  const objectPath = String(options.objectPath || '').trim();
  const contentType = options.contentType || 'application/octet-stream';

  if (!bucketName) {
    throw new Error('GCS_IMAGE_BUCKET is not configured');
  }
  if (!objectPath) {
    throw new Error('Cloud Storage objectPath is required');
  }

  const file = getStorageClient().bucket(bucketName).file(objectPath);
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  return {
    bucket: bucketName,
    objectPath,
    contentType,
    url: getPublicObjectUrl(bucketName, objectPath),
  };
}

function isStorageConfigured() {
  return Boolean(getBucketName());
}

module.exports = {
  DEFAULT_BUCKET,
  getBucketName,
  getPublicObjectUrl,
  isStorageConfigured,
  uploadPublicObject,
};
