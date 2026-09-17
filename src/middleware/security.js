const crypto = require('crypto');

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    return res.status(503).json({ error: 'Admin API is not configured' });
  }

  const token = getBearerToken(req) || req.get('x-admin-api-key');
  if (!safeEqual(token, configuredKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireWebhookSecret(req, res, next) {
  const configuredSecret = process.env.DIALOGFLOW_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return res.status(503).json({ error: 'Webhook authentication is not configured' });
  }

  const token = getBearerToken(req) || req.get('x-dialogflow-secret');
  if (!safeEqual(token, configuredSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { requireAdmin, requireWebhookSecret };
