const ApiError = require('./ApiError');
const env = require('../config/env');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' -> Date at 00:00:00.000 UTC. Attendance dates are calendar days, never instants. */
function parseDateOnly(value, field = 'date') {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new ApiError(400, `${field} must be in YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${field} is not a valid calendar date`);
  }
  return date;
}

/** Current calendar day ('YYYY-MM-DD') in the institution's timezone. */
function todayString(timeZone = env.ATTENDANCE_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

const toDateString = (date) => new Date(date).toISOString().slice(0, 10);

function assertNotFuture(value, field = 'date') {
  if (value > todayString()) throw new ApiError(400, `${field} cannot be in the future`);
}

function addDays(dateString, days) {
  const d = parseDateOnly(dateString);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

module.exports = { parseDateOnly, todayString, toDateString, assertNotFuture, addDays };
