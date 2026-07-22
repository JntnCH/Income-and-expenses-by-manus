/**
 * Credentials Parser Utility
 * 
 * Handles normalization of Google Service Account credentials
 * across different environments (local, Cloud Run, GitHub Actions)
 * 
 * Problem: GitHub Secrets store private keys with escaped newlines (\\n)
 * but google-auth-library expects literal newlines (\n)
 */

/**
 * Parse and normalize private key from environment variable
 * Handles multiple formats:
 * - Quoted strings: "-----BEGIN...\\n...-----END"
 * - Unquoted strings: -----BEGIN...\\n...-----END
 * - Already normalized: -----BEGIN...\n...-----END
 * 
 * @param {string} keyString - Raw private key from environment
 * @returns {string} Normalized private key with literal newlines
 * @throws {Error} If key format is invalid
 */
function parsePrivateKey(keyString) {
  if (!keyString || typeof keyString !== 'string') {
    throw new Error('[AUTH] GOOGLE_PRIVATE_KEY is missing or invalid type');
  }

  let key = keyString;

  // Step 1: Remove surrounding quotes if present
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }

  // Step 2: Normalize escaped newlines to literal newlines
  // Handle both \\n (double-escaped) and \n (single-escaped)
  key = key.replace(/\\n/g, '\n');

  // Step 3: Trim whitespace
  key = key.trim();

  // Step 4: Validate key has proper format
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('[AUTH] GOOGLE_PRIVATE_KEY missing BEGIN marker');
  }
  if (!key.includes('-----END PRIVATE KEY-----')) {
    throw new Error('[AUTH] GOOGLE_PRIVATE_KEY missing END marker');
  }

  return key;
}

/**
 * Parse credentials from JSON string (from Secret Manager or direct JSON)
 * @param {string} jsonString - JSON service account credentials
 * @returns {Object} Parsed credentials with normalized private key
 * @throws {Error} If JSON or key format is invalid
 */
function parseServiceAccountJson(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    throw new Error('[AUTH] GOOGLE_SERVICE_ACCOUNT_JSON is missing');
  }

  let credentials;
  try {
    credentials = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`[AUTH] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: ${e.message}`);
  }

  if (!credentials.client_email) {
    throw new Error('[AUTH] Missing client_email in credentials');
  }

  if (!credentials.private_key) {
    throw new Error('[AUTH] Missing private_key in credentials');
  }

  // Normalize the private key
  credentials.private_key = parsePrivateKey(credentials.private_key);

  return credentials;
}

/**
 * Validate credentials structure
 * @param {Object} credentials - Credentials object
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
function validateCredentials(credentials) {
  const required = ['client_email', 'private_key'];
  const missing = required.filter(field => !credentials[field]);

  if (missing.length > 0) {
    throw new Error(`[AUTH] Missing required fields: ${missing.join(', ')}`);
  }

  if (!credentials.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('[AUTH] Invalid private key format');
  }

  return true;
}

module.exports = {
  parsePrivateKey,
  parseServiceAccountJson,
  validateCredentials
};
