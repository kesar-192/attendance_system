const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { parsePagination, buildMeta, searchRegex, str } = require('../utils/helpers');

const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const filter = {};
  const role = str(req.query.role);
  const q = str(req.query.q);
  if (role) filter.role = role;
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
    User.countDocuments(filter)
  ]);
  ok(res, users, { meta: buildMeta(pagination, total) });
});

const setActive = asyncHandler(async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') throw new ApiError(400, 'isActive must be true or false');
  if (req.params.id === req.user.id) throw new ApiError(400, 'You cannot deactivate your own account');
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  user.isActive = req.body.isActive;
  await user.save();
  ok(res, user.toJSON());
});

module.exports = { list, setActive };
