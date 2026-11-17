const Notification = require('../models/Notification');

/**
 * Creates one in-app notification per recipient. Notification failures must never break
 * the business operation that triggered them, so errors are logged and swallowed.
 */
async function notifyUsers(userIds, { title, message, type = 'system', link, meta }) {
  const unique = [...new Set((userIds || []).map(String))];
  if (unique.length === 0) return [];
  try {
    return await Notification.insertMany(
      unique.map((userId) => ({ userId, title, message, type, link, meta })),
      { ordered: false }
    );
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('Failed to create notifications:', err.message);
    return [];
  }
}

module.exports = { notifyUsers };
