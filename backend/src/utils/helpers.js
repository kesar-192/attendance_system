const mongoose = require('mongoose');
const ApiError = require('./ApiError');

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_RE.test(value);

/** Returns the value as a string ObjectId or throws a 400. */
function assertObjectId(value, field = 'id') {
  const str = value && typeof value === 'object' && value._id ? String(value._id) : value;
  if (!isObjectId(str)) throw new ApiError(400, `Invalid ${field}`);
  return str;
}

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

/** Express `router.param` handler that rejects malformed ObjectIds early. */
function validateIdParam(req, _res, next, value, name) {
  if (!isObjectId(value)) return next(new ApiError(400, `Invalid ${name}`));
  return next();
}

function pick(source, keys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" regex built from untrusted input. */
const searchRegex = (value) => new RegExp(escapeRegex(String(value).trim().slice(0, 100)), 'i');

function parsePagination(query, { defaultLimit = 10, maxLimit = 100 } = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

const buildMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  pages: Math.max(Math.ceil(total / limit), 1)
});

/** Query-string value -> trimmed string (arrays / objects are rejected to avoid operator injection). */
function str(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ApiError(400, 'Invalid query parameter');
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const bool = (value) => ['true', '1', 'yes'].includes(String(value).toLowerCase());

module.exports = {
  isObjectId,
  assertObjectId,
  toObjectId,
  validateIdParam,
  pick,
  escapeRegex,
  searchRegex,
  parsePagination,
  buildMeta,
  str,
  bool
};
