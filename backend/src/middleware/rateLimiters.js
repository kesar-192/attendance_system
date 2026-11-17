const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const handler = (_req, res) =>
  res.status(429).json({ success: false, message: 'Too many requests. Please try again later' });

function buildRateLimiters({ enabled = !env.isTest, apiMax = env.RATE_LIMIT_MAX, authMax = env.AUTH_RATE_LIMIT_MAX } = {}) {
  const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  const common = { windowMs, standardHeaders: 'draft-7', legacyHeaders: false, handler, skip: () => !enabled };
  return {
    // every /api request
    apiLimiter: rateLimit({ ...common, limit: apiMax }),
    // brute-force protection on the login endpoint; successful logins do not count
    authLimiter: rateLimit({ ...common, limit: authMax, skipSuccessfulRequests: true })
  };
}

module.exports = { buildRateLimiters };
