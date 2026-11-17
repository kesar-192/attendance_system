const Notification = require('../models/Notification');
const { TYPES } = require('../models/Notification');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { assertObjectId, parsePagination, buildMeta, bool } = require('../utils/helpers');
const { notifyUsers } = require('../services/notify');

const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filter = { userId: req.user.id };
  if (bool(req.query.unread)) filter.read = false;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: req.user.id, read: false })
  ]);
  ok(res, items, { meta: { ...buildMeta(pagination, total), unread } });
});

const unreadCount = asyncHandler(async (req, res) => {
  ok(res, { unread: await Notification.countDocuments({ userId: req.user.id, read: false }) });
});

const markRead = asyncHandler(async (req, res) => {
  const item = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { read: true }, { new: true });
  if (!item) throw new ApiError(404, 'Notification not found');
  ok(res, item);
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
  ok(res, { updated: result.modifiedCount });
});

const remove = asyncHandler(async (req, res) => {
  const item = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!item) throw new ApiError(404, 'Notification not found');
  ok(res, { id: req.params.id }, { message: 'Notification deleted' });
});

/** Admin broadcast: target explicit userIds and/or a whole role. */
const broadcast = asyncHandler(async (req, res) => {
  const { title, message, type = 'system', role, userIds } = req.body;
  if (!title || !message) throw new ApiError(400, 'title and message are required');
  if (!TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${TYPES.join(', ')}`);

  let recipients = [];
  if (Array.isArray(userIds)) recipients = userIds.map((id) => assertObjectId(id, 'userIds'));
  if (role) {
    if (!['admin', 'faculty', 'student'].includes(role)) throw new ApiError(400, 'role must be admin, faculty or student');
    recipients = recipients.concat((await User.find({ role, isActive: true }).distinct('_id')).map(String));
  }
  if (recipients.length === 0) throw new ApiError(400, 'Provide a role or at least one userId');

  const docs = await notifyUsers(recipients, { title, message, type });
  created(res, { sent: docs.length });
});

module.exports = { list, unreadCount, markRead, markAllRead, remove, broadcast };
