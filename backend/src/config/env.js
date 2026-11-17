require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

function required(name, devDefault) {
  const value = process.env[name];
  if (value) return value;
  if (isProd) throw new Error(`Missing required environment variable: ${name}`);
  return devDefault;
}

function int(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = {
  NODE_ENV,
  isProd,
  isTest: NODE_ENV === 'test',
  PORT: int('PORT', 5000),
  TRUST_PROXY: int('TRUST_PROXY', 0),
  MONGO_URI: required('MONGO_URI', 'mongodb://127.0.0.1:27017/campusflow'),
  JWT_SECRET: required('JWT_SECRET', 'dev-only-jwt-secret-change-me'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  QR_SECRET: required('QR_SECRET', 'dev-only-qr-secret-change-me'),
  BCRYPT_ROUNDS: int('BCRYPT_ROUNDS', NODE_ENV === 'test' ? 4 : 10),
  CORS_ORIGIN: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  RATE_LIMIT_WINDOW_MINUTES: int('RATE_LIMIT_WINDOW_MINUTES', 15),
  RATE_LIMIT_MAX: int('RATE_LIMIT_MAX', 300),
  AUTH_RATE_LIMIT_MAX: int('AUTH_RATE_LIMIT_MAX', 10),
  ATTENDANCE_THRESHOLD: int('ATTENDANCE_THRESHOLD', 75),
  ATTENDANCE_TZ: process.env.ATTENDANCE_TZ || 'Asia/Kolkata',
  QR_ROTATE_SECONDS: int('QR_ROTATE_SECONDS', 30)
};

if (isProd) {
  if (env.JWT_SECRET.length < 32 || env.QR_SECRET.length < 32) {
    throw new Error('JWT_SECRET and QR_SECRET must be at least 32 characters in production');
  }
  if (env.JWT_SECRET === env.QR_SECRET) {
    throw new Error('JWT_SECRET and QR_SECRET must be different values');
  }
  if (env.CORS_ORIGIN.includes('*')) {
    throw new Error('CORS_ORIGIN must list explicit origins in production (wildcard is not allowed)');
  }
}

module.exports = env;
