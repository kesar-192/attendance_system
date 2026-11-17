const User = require('../models/User');
const Faculty = require('../models/Faculty');
const Subject = require('../models/Subject');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { pick, parsePagination, buildMeta, searchRegex, str } = require('../utils/helpers');
const { getFacultyProfile } = require('../services/access');

const PROFILE_FIELDS = ['employeeId', 'department', 'designation', 'phone'];
const POPULATE = [{ path: 'userId', select: 'name email isActive' }];

const list = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 10, maxLimit: 200 });
  const filter = {};
  if (str(req.query.department)) filter.department = str(req.query.department);

  const q = str(req.query.q);
  if (q) {
    const rx = searchRegex(q);
    const userIds = await User.find({ role: 'faculty', $or: [{ name: rx }, { email: rx }] }).distinct('_id');
    filter.$or = [{ userId: { $in: userIds } }, { employeeId: rx }];
  }

  const [faculty, total] = await Promise.all([
    Faculty.find(filter).sort({ employeeId: 1 }).skip(pagination.skip).limit(pagination.limit).populate(POPULATE),
    Faculty.countDocuments(filter)
  ]);
  ok(res, faculty, { meta: buildMeta(pagination, total) });
});

const getOne = asyncHandler(async (req, res) => {
  const faculty = await Faculty.findById(req.params.id).populate(POPULATE);
  if (!faculty) throw new ApiError(404, 'Faculty not found');
  ok(res, faculty);
});

const create = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const profile = pick(req.body, PROFILE_FIELDS);
  if (profile.employeeId && (await Faculty.exists({ employeeId: String(profile.employeeId).trim().toUpperCase() }))) {
    throw new ApiError(409, 'A record with this employeeId already exists');
  }

  const user = await User.create({ name, email, password, role: 'faculty' });
  try {
    const faculty = await Faculty.create({ ...profile, userId: user._id });
    created(res, await faculty.populate(POPULATE));
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
});

const update = asyncHandler(async (req, res) => {
  const faculty = await Faculty.findById(req.params.id);
  if (!faculty) throw new ApiError(404, 'Faculty not found');
  const user = await User.findById(faculty.userId);
  if (!user) throw new ApiError(404, 'Linked user account not found');

  const data = pick(req.body, PROFILE_FIELDS);
  if (data.employeeId !== undefined) {
    const employeeId = String(data.employeeId).trim().toUpperCase();
    if (await Faculty.exists({ employeeId, _id: { $ne: faculty._id } })) {
      throw new ApiError(409, 'A record with this employeeId already exists');
    }
  }
  if (req.body.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (await User.exists({ email, _id: { $ne: user._id } })) throw new ApiError(409, 'A record with this email already exists');
    user.email = email;
  }
  if (req.body.name !== undefined) user.name = req.body.name;
  if (req.body.password) user.password = req.body.password;
  if (typeof req.body.isActive === 'boolean') user.isActive = req.body.isActive;

  faculty.set(data);
  await Promise.all([user.validate(), faculty.validate()]);
  await user.save();
  await faculty.save();
  ok(res, await faculty.populate(POPULATE));
});

const remove = asyncHandler(async (req, res) => {
  const faculty = await Faculty.findById(req.params.id);
  if (!faculty) throw new ApiError(404, 'Faculty not found');
  const subjects = await Subject.countDocuments({ facultyId: faculty._id });
  if (subjects) throw new ApiError(409, `Cannot delete faculty who still teach ${subjects} subject(s). Reassign them first`);

  await Promise.all([
    Notification.deleteMany({ userId: faculty.userId }),
    User.deleteOne({ _id: faculty.userId }),
    faculty.deleteOne()
  ]);
  ok(res, { id: req.params.id }, { message: 'Faculty deleted' });
});

const getMe = asyncHandler(async (req, res) => {
  const faculty = await getFacultyProfile(req.user.id);
  ok(res, await faculty.populate(POPULATE));
});

/** Faculty may only change their own name, phone and designation. */
const updateMe = asyncHandler(async (req, res) => {
  const faculty = await getFacultyProfile(req.user.id);
  const user = await User.findById(req.user.id);
  if (req.body.name !== undefined) user.name = req.body.name;
  faculty.set(pick(req.body, ['phone', 'designation']));
  await Promise.all([user.validate(), faculty.validate()]);
  await user.save();
  await faculty.save();
  ok(res, await faculty.populate(POPULATE));
});

module.exports = { list, getOne, create, update, remove, getMe, updateMe };
