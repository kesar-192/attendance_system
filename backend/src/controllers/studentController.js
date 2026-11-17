const User = require('../models/User');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { pick, assertObjectId, parsePagination, buildMeta, searchRegex, str } = require('../utils/helpers');
const { getStudentProfile } = require('../services/access');

const PROFILE_FIELDS = ['enrollmentNo', 'courseId', 'semester', 'phone', 'address', 'dateOfBirth'];

const POPULATE = [
  { path: 'userId', select: 'name email isActive' },
  { path: 'courseId', select: 'name code department' }
];

const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const filter = {};
  if (str(req.query.courseId)) filter.courseId = assertObjectId(str(req.query.courseId), 'courseId');
  if (str(req.query.semester)) filter.semester = Number(str(req.query.semester));

  const q = str(req.query.q);
  if (q) {
    const rx = searchRegex(q);
    const userIds = await User.find({ role: 'student', $or: [{ name: rx }, { email: rx }] }).distinct('_id');
    filter.$or = [{ userId: { $in: userIds } }, { enrollmentNo: rx }];
  }

  const [students, total] = await Promise.all([
    Student.find(filter).sort({ enrollmentNo: 1 }).skip(pagination.skip).limit(pagination.limit).populate(POPULATE),
    Student.countDocuments(filter)
  ]);
  ok(res, students, { meta: buildMeta(pagination, total) });
});

const getOne = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id).populate(POPULATE);
  if (!student) throw new ApiError(404, 'Student not found');
  ok(res, student);
});

/** Creates the login account and the student profile together. */
const create = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const profile = pick(req.body, PROFILE_FIELDS);
  assertObjectId(profile.courseId, 'courseId');
  if (!(await Course.exists({ _id: profile.courseId }))) throw new ApiError(404, 'Course not found');
  if (profile.enrollmentNo && (await Student.exists({ enrollmentNo: String(profile.enrollmentNo).trim().toUpperCase() }))) {
    throw new ApiError(409, 'A record with this enrollmentNo already exists');
  }

  const user = await User.create({ name, email, password, role: 'student' });
  try {
    const student = await Student.create({ ...profile, userId: user._id });
    created(res, await student.populate(POPULATE));
  } catch (err) {
    await User.deleteOne({ _id: user._id }); // do not leave an orphan login behind
    throw err;
  }
});

const update = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, 'Student not found');
  const user = await User.findById(student.userId);
  if (!user) throw new ApiError(404, 'Linked user account not found');

  const data = pick(req.body, PROFILE_FIELDS);
  if (data.courseId !== undefined) {
    assertObjectId(data.courseId, 'courseId');
    if (!(await Course.exists({ _id: data.courseId }))) throw new ApiError(404, 'Course not found');
  }
  if (data.enrollmentNo !== undefined) {
    const enrollmentNo = String(data.enrollmentNo).trim().toUpperCase();
    if (await Student.exists({ enrollmentNo, _id: { $ne: student._id } })) {
      throw new ApiError(409, 'A record with this enrollmentNo already exists');
    }
  }
  if (req.body.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (await User.exists({ email, _id: { $ne: user._id } })) throw new ApiError(409, 'A record with this email already exists');
    user.email = email;
  }
  if (req.body.name !== undefined) user.name = req.body.name;
  if (req.body.password) user.password = req.body.password; // admin password reset
  if (typeof req.body.isActive === 'boolean') user.isActive = req.body.isActive;

  student.set(data);
  await Promise.all([user.validate(), student.validate()]);
  await user.save();
  await student.save();
  ok(res, await student.populate(POPULATE));
});

const remove = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new ApiError(404, 'Student not found');
  await Promise.all([
    Attendance.deleteMany({ studentId: student._id }),
    Leave.deleteMany({ studentId: student._id }),
    Notification.deleteMany({ userId: student.userId }),
    User.deleteOne({ _id: student.userId }),
    student.deleteOne()
  ]);
  ok(res, { id: req.params.id }, { message: 'Student deleted' });
});

const getMe = asyncHandler(async (req, res) => {
  const student = await getStudentProfile(req.user.id);
  ok(res, await student.populate(POPULATE));
});

/** Students may only change their own name, phone and address. */
const updateMe = asyncHandler(async (req, res) => {
  const student = await getStudentProfile(req.user.id);
  const user = await User.findById(req.user.id);
  if (req.body.name !== undefined) user.name = req.body.name;
  student.set(pick(req.body, ['phone', 'address']));
  await Promise.all([user.validate(), student.validate()]);
  await user.save();
  await student.save();
  ok(res, await student.populate(POPULATE));
});

module.exports = { list, getOne, create, update, remove, getMe, updateMe };
