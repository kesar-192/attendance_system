const jwt = require('jsonwebtoken');
const QrSession = require('../models/QrSession');
const Subject = require('../models/Subject');
const Attendance = require('../models/Attendance');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { assertObjectId } = require('../utils/helpers');
const { parseDateOnly, todayString, toDateString } = require('../utils/dates');
const { getStudentProfile, assertCanManageSubject } = require('../services/access');

const AUDIENCE = 'campusflow:qr';
const DEFAULT_MINUTES = 10;
const MAX_MINUTES = 180;

/**
 * The QR payload is a short-lived signed token. It expires after QR_ROTATE_SECONDS (or when the session
 * ends, whichever is first), so a screenshot shared with an absent friend stops working within seconds.
 * The faculty screen keeps calling /refresh to display a fresh code.
 */
function issueToken(session) {
  const remaining = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
  const ttl = Math.max(Math.min(env.QR_ROTATE_SECONDS, remaining), 1);
  const token = jwt.sign({ sid: String(session._id) }, env.QR_SECRET, {
    algorithm: 'HS256',
    audience: AUDIENCE,
    expiresIn: ttl
  });
  return { token, tokenExpiresAt: new Date(Date.now() + ttl * 1000), rotateSeconds: ttl };
}

async function loadOwnedSession(req) {
  const session = await QrSession.findById(req.params.sessionId);
  if (!session) throw new ApiError(404, 'QR session not found');
  const subject = await Subject.findById(session.subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await assertCanManageSubject(req.user, subject);
  return { session, subject };
}

const generate = asyncHandler(async (req, res) => {
  const subjectId = assertObjectId(req.body.subjectId, 'subjectId');
  const minutes = req.body.durationMinutes === undefined ? DEFAULT_MINUTES : Number(req.body.durationMinutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    throw new ApiError(400, `durationMinutes must be a whole number between 1 and ${MAX_MINUTES}`);
  }
  const subject = await Subject.findById(subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');
  await assertCanManageSubject(req.user, subject);

  // only one live code per subject
  await QrSession.updateMany({ subjectId: subject._id, active: true }, { active: false });
  const session = await QrSession.create({
    subjectId: subject._id,
    createdBy: req.user.id,
    date: parseDateOnly(todayString()),
    expiresAt: new Date(Date.now() + minutes * 60 * 1000)
  });

  created(res, {
    sessionId: session._id,
    subject: { _id: subject._id, name: subject.name, code: subject.code },
    date: toDateString(session.date),
    expiresAt: session.expiresAt,
    ...issueToken(session)
  });
});

const refresh = asyncHandler(async (req, res) => {
  const { session } = await loadOwnedSession(req);
  if (!session.active || session.expiresAt <= new Date()) throw new ApiError(410, 'This QR session has ended');
  ok(res, { sessionId: session._id, expiresAt: session.expiresAt, ...issueToken(session) });
});

const close = asyncHandler(async (req, res) => {
  const { session } = await loadOwnedSession(req);
  session.active = false;
  await session.save();
  ok(res, { sessionId: session._id, active: false });
});

const status = asyncHandler(async (req, res) => {
  const { session, subject } = await loadOwnedSession(req);
  const scanned = await Attendance.countDocuments({ qrSessionId: session._id });
  ok(res, {
    sessionId: session._id,
    subject: { _id: subject._id, name: subject.name, code: subject.code },
    active: session.active && session.expiresAt > new Date(),
    expiresAt: session.expiresAt,
    scanned
  });
});

const scan = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (typeof token !== 'string' || !token) throw new ApiError(400, 'QR token is required');

  let payload;
  try {
    payload = jwt.verify(token, env.QR_SECRET, { algorithms: ['HS256'], audience: AUDIENCE });
  } catch {
    // 400 (not 401) so an expired QR never looks like an expired login session
    throw new ApiError(400, 'This QR code is invalid or has expired. Scan the latest code shown by your faculty');
  }

  const session = await QrSession.findById(payload.sid);
  if (!session || !session.active || session.expiresAt <= new Date()) throw new ApiError(410, 'This attendance session has ended');

  const [subject, student] = await Promise.all([Subject.findById(session.subjectId), getStudentProfile(req.user.id)]);
  if (!subject) throw new ApiError(404, 'Subject not found');
  if (String(student.courseId) !== String(subject.courseId) || student.semester !== subject.semester) {
    throw new ApiError(403, 'You are not enrolled in this subject');
  }

  // Insert-only upsert: never overwrites a mark the faculty already made, and is safe against double scans.
  const result = await Attendance.updateOne(
    { studentId: student._id, subjectId: subject._id, date: session.date },
    { $setOnInsert: { status: 'present', method: 'qr', markedBy: req.user.id, qrSessionId: session._id, remarks: '' } },
    { upsert: true }
  );
  const alreadyMarked = result.upsertedCount === 0;
  const record = await Attendance.findOne({ studentId: student._id, subjectId: subject._id, date: session.date });

  const body = {
    alreadyMarked,
    status: record.status,
    subject: { _id: subject._id, name: subject.name, code: subject.code },
    date: toDateString(session.date)
  };
  if (alreadyMarked) return ok(res, body, { message: `Attendance for ${subject.code} was already recorded as ${record.status}` });
  return created(res, body, `Attendance marked present for ${subject.code}`);
});

module.exports = { generate, refresh, close, status, scan };
