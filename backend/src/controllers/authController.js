const User = require('../models/User');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { signToken } = require('../middleware/auth');

const requireString = (value, field) => {
  if (typeof value !== 'string' || value.trim() === '') throw new ApiError(400, `${field} is required`);
  return value;
};

async function loadProfile(user) {
  if (user.role === 'student') {
    return Student.findOne({ userId: user._id }).populate('courseId', 'name code department');
  }
  if (user.role === 'faculty') return Faculty.findOne({ userId: user._id });
  return null;
}

const login = asyncHandler(async (req, res) => {
  const email = requireString(req.body.email, 'Email').trim().toLowerCase();
  const password = requireString(req.body.password, 'Password');

  const user = await User.findOne({ email }).select('+password');
  const valid = user ? await user.comparePassword(password) : false;
  if (!valid) throw new ApiError(401, 'Invalid email or password');
  if (!user.isActive) throw new ApiError(403, 'This account has been deactivated');

  ok(res, { token: signToken(user), user: user.toJSON(), profile: await loadProfile(user) });
});

/**
 * Admin-only account creation for administrators.
 * Students and faculty are provisioned through POST /api/students and POST /api/faculty,
 * which create the login account and the profile together.
 */
const registerAdmin = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const user = await User.create({ name, email, password, role: 'admin' });
  created(res, user.toJSON(), 'Administrator account created');
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  ok(res, { user: user.toJSON(), profile: await loadProfile(user) });
});

const changePassword = asyncHandler(async (req, res) => {
  const currentPassword = requireString(req.body.currentPassword, 'Current password');
  const newPassword = requireString(req.body.newPassword, 'New password');
  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(currentPassword))) throw new ApiError(401, 'Current password is incorrect');
  if (currentPassword === newPassword) throw new ApiError(400, 'New password must differ from the current password');

  user.password = newPassword;
  await user.save();
  ok(res, { token: signToken(user) }, { message: 'Password updated' });
});

module.exports = { login, registerAdmin, me, changePassword };
