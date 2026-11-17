const Leave = require('../models/Leave');
const { LEAVE_STATUSES } = require('../models/Leave');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Faculty = require('../models/Faculty');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { assertObjectId, parsePagination, buildMeta, str } = require('../utils/helpers');
const { parseDateOnly, toDateString } = require('../utils/dates');
const { getStudentProfile, visibleStudentIds } = require('../services/access');
const { notifyUsers } = require('../services/notify');

const MAX_LEAVE_DAYS = 90;

const POPULATE = [
  {
    path: 'studentId',
    select: 'enrollmentNo userId courseId semester',
    populate: [
      { path: 'userId', select: 'name email' },
      { path: 'courseId', select: 'name code' }
    ]
  },
  { path: 'reviewedBy', select: 'name role' }
];

/** Faculty teaching the student's course + all active admins. */
async function reviewerUserIds(courseId) {
  const facultyIds = await Subject.find({ courseId }).distinct('facultyId');
  const [faculty, admins] = await Promise.all([
    Faculty.find({ _id: { $in: facultyIds } }).select('userId'),
    User.find({ role: 'admin', isActive: true }).select('_id')
  ]);
  return [...faculty.map((f) => f.userId), ...admins.map((a) => a._id)];
}

async function visibilityFilter(user) {
  const ids = await visibleStudentIds(user);
  return ids ? { studentId: { $in: ids } } : {};
}

const apply = asyncHandler(async (req, res) => {
  const student = await getStudentProfile(req.user.id);
  const from = parseDateOnly(req.body.fromDate, 'fromDate');
  const to = parseDateOnly(req.body.toDate, 'toDate');
  if (to < from) throw new ApiError(400, 'toDate must be on or after fromDate');
  if ((to - from) / 86400000 + 1 > MAX_LEAVE_DAYS) throw new ApiError(400, `A leave request cannot exceed ${MAX_LEAVE_DAYS} days`);

  const overlapping = await Leave.exists({
    studentId: student._id,
    status: { $in: ['pending', 'approved'] },
    fromDate: { $lte: to },
    toDate: { $gte: from }
  });
  if (overlapping) throw new ApiError(409, 'You already have a pending or approved leave overlapping these dates');

  const leave = await Leave.create({
    studentId: student._id,
    type: req.body.type,
    fromDate: from,
    toDate: to,
    reason: req.body.reason
  });

  const recipients = await reviewerUserIds(student.courseId);
  await notifyUsers(recipients, {
    title: 'New leave request',
    message: `${req.user.name} requested leave from ${toDateString(from)} to ${toDateString(to)}.`,
    type: 'leave',
    link: '/leaves',
    meta: { leaveId: leave._id }
  });
  created(res, await leave.populate(POPULATE));
});

const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const filter = await visibilityFilter(req.user);

  if (str(req.query.status)) {
    if (!LEAVE_STATUSES.includes(str(req.query.status))) throw new ApiError(400, `status must be one of: ${LEAVE_STATUSES.join(', ')}`);
    filter.status = str(req.query.status);
  }
  if (str(req.query.studentId) && req.user.role !== 'student') {
    const studentId = assertObjectId(str(req.query.studentId), 'studentId');
    // narrow, never widen, the visibility scope
    if (filter.studentId) filter.studentId = { $in: filter.studentId.$in.filter((id) => String(id) === studentId) };
    else filter.studentId = studentId;
  }

  const [leaves, total] = await Promise.all([
    Leave.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).populate(POPULATE),
    Leave.countDocuments(filter)
  ]);
  ok(res, leaves, { meta: buildMeta(pagination, total) });
});

async function findVisibleLeave(req) {
  const leave = await Leave.findOne({ _id: req.params.id, ...(await visibilityFilter(req.user)) });
  if (!leave) throw new ApiError(404, 'Leave request not found');
  return leave;
}

const getOne = asyncHandler(async (req, res) => {
  const leave = await findVisibleLeave(req);
  ok(res, await leave.populate(POPULATE));
});

const review = asyncHandler(async (req, res) => {
  const { status, comment } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw new ApiError(400, 'status must be approved or rejected');
  const leave = await findVisibleLeave(req);
  if (leave.status !== 'pending') throw new ApiError(409, `This request has already been ${leave.status}`);

  leave.status = status;
  leave.reviewedBy = req.user.id;
  leave.reviewedAt = new Date();
  leave.reviewComment = typeof comment === 'string' ? comment : '';
  await leave.save();

  const student = await Student.findById(leave.studentId).select('userId');
  if (student) {
    await notifyUsers([student.userId], {
      title: `Leave ${status}`,
      message: `Your leave from ${toDateString(leave.fromDate)} to ${toDateString(leave.toDate)} was ${status} by ${req.user.name}.${
        leave.reviewComment ? ` Note: ${leave.reviewComment}` : ''
      }`.slice(0, 500),
      type: 'leave',
      link: '/student/leaves',
      meta: { leaveId: leave._id }
    });
  }
  ok(res, await leave.populate(POPULATE));
});

const cancel = asyncHandler(async (req, res) => {
  const student = await getStudentProfile(req.user.id);
  const leave = await Leave.findOne({ _id: req.params.id, studentId: student._id });
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (leave.status !== 'pending') throw new ApiError(409, 'Only pending requests can be cancelled');
  leave.status = 'cancelled';
  await leave.save();
  ok(res, await leave.populate(POPULATE));
});

module.exports = { apply, list, getOne, review, cancel };
