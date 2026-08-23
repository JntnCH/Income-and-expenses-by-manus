const crypto = require('node:crypto');

function getSubmittedToken(req) {
  const authorization = req.get('authorization') || '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7);
  return req.get('x-admin-token') || '';
}

function tokensMatch(expected, submitted) {
  if (!expected || !submitted) return false;
  const expectedBuffer = Buffer.from(expected);
  const submittedBuffer = Buffer.from(submitted);
  return expectedBuffer.length === submittedBuffer.length && crypto.timingSafeEqual(expectedBuffer, submittedBuffer);
}

function requireAdminToken(req, res, next) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({ error: 'Admin API is disabled. Set ADMIN_API_TOKEN to enable it.' });
  }
  if (!tokensMatch(expectedToken, getSubmittedToken(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

module.exports = { getSubmittedToken, tokensMatch, requireAdminToken };
