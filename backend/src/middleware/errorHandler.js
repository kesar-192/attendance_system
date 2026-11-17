const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(err, req, res, _next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'Something went wrong';
  let errors = err.errors && Array.isArray(err.errors) ? err.errors : undefined;

  if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    message = fields.length ? `A record with this ${fields.join(', ')} already exists` : 'Duplicate value';
    errors = fields.map((field) => ({ field, message: 'Must be unique' }));
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = errors.map((e) => e.message).join('; ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for '${err.path}'`;
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Session expired. Please log in again';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    status = 401;
    message = 'Invalid authentication token';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }

  if (status >= 500) {
    if (!env.isTest) console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    if (env.isProd) message = 'Internal server error';
  }

  const body = { success: false, message };
  if (errors && errors.length) body.errors = errors;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
