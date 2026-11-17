const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isObjectId } = require('../utils/helpers');

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'campusflow'
  });
}

/** Authenticates the Bearer token and loads the current user (so deactivation / role changes take effect immediately). */
const verifyToken = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'Authentication required');

  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'campusflow' });
  if (!isObjectId(payload.sub)) throw new ApiError(401, 'Invalid token');

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, 'Account not found or deactivated');
  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
    throw new ApiError(401, 'Password was changed. Please log in again');
  }

  req.user = { id: String(user._id), role: user.role, name: user.name, email: user.email };
  next();
});

/** RBAC guard. Usage: router.post('/', verifyToken, verifyRole('admin', 'faculty'), handler) */
const verifyRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    return next();
  };

module.exports = { signToken, verifyToken, verifyRole };
