const vision = require('@google-cloud/vision');
const { parsePrivateKey, parseServiceAccountJson } = require('../../utils/credentialsParser');

let client;

function getClient() {
  if (client) return client;

  let credentials;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    credentials = parseServiceAccountJson(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } else {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
    if (!email || !privateKeyRaw) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY');
    }
    credentials = { client_email: email, private_key: parsePrivateKey(privateKeyRaw) };
  }

  client = new vision.ImageAnnotatorClient({ credentials });
  return client;
}

/**
 * Recognize text from image using Google Cloud Vision
 * Supports both Buffer and File Path inputs
 */
async function recognize(imageInput) {
  try {
    const visionClient = getClient();

    // Support both Buffer and File Path
    const imagePayload = typeof imageInput === 'string'
      ? { source: { filename: imageInput } }
      : { content: imageInput };

    const [result] = await visionClient.textDetection({ image: imagePayload });
    const detections = result.textAnnotations;

    if (detections && detections.length > 0) {
      return detections[0].description;
    }
    return '';
  } catch (error) {
    console.error('[Vision] OCR Error:', error.message);
    throw error;
  }
}

module.exports = { recognize };
