const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Faculty = require('../src/models/Faculty');
const Student = require('../src/models/Student');
const Subject = require('../src/models/Subject');
const { signToken } = require('../src/middleware/auth');
const { todayString, addDays } = require('../src/utils/dates');

const PASSWORD = 'Passw0rd!';
let seq = 0;
const next = () => {
  seq += 1;
  return seq;
};

async function connectTestDb() {
  const dbName = `cf_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName });
  require('../src/app'); // make sure every model is registered
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build unique indexes
}

async function disconnectTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function createAdmin(overrides = {}) {
  const n = next();
  const user = await User.create({ name: `Admin ${n}`, email: `admin${n}@test.dev`, password: PASSWORD, role: 'admin', ...overrides });
  return { user, token: signToken(user) };
}

async function createCourse(overrides = {}) {
  const n = next();
  return Course.create({ name: `Course ${n}`, code: `CRS${n}`, department: 'Computer Science', ...overrides });
}

async function createFaculty(overrides = {}) {
  const n = next();
  const user = await User.create({ name: `Faculty ${n}`, email: `faculty${n}@test.dev`, password: PASSWORD, role: 'faculty', ...overrides.user });
  const profile = await Faculty.create({ userId: user._id, employeeId: `EMP${n}`, department: 'Computer Science', ...overrides.profile });
  return { user, profile, token: signToken(user) };
}

async function createStudent(course, overrides = {}) {
  const n = next();
  const user = await User.create({ name: `Student ${n}`, email: `student${n}@test.dev`, password: PASSWORD, role: 'student', ...overrides.user });
  const profile = await Student.create({
    userId: user._id,
    courseId: course._id,
    enrollmentNo: `ENR${n}`,
    semester: 3,
    ...overrides.profile
  });
  return { user, profile, token: signToken(user) };
}

async function createSubject(course, faculty, overrides = {}) {
  const n = next();
  return Subject.create({ name: `Subject ${n}`, code: `SUB${n}`, courseId: course._id, facultyId: faculty.profile._id, semester: 3, ...overrides });
}

/** A ready-made school: 1 admin, 2 faculty, 1 course, 1 subject owned by faculty A, 4 enrolled students, 1 student in another semester. */
async function createSchool() {
  const admin = await createAdmin();
  const facultyA = await createFaculty();
  const facultyB = await createFaculty();
  const course = await createCourse();
  const subject = await createSubject(course, facultyA);
  const students = [];
  for (let i = 0; i < 4; i += 1) students.push(await createStudent(course));
  const otherSemester = await createStudent(course, { profile: { semester: 4 } });
  return { admin, facultyA, facultyB, course, subject, students, otherSemester };
}

const expiredToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: 'campusflow',
    expiresIn: -10
  });

module.exports = {
  PASSWORD,
  connectTestDb,
  disconnectTestDb,
  clearDb,
  bearer,
  createAdmin,
  createCourse,
  createFaculty,
  createStudent,
  createSubject,
  createSchool,
  expiredToken,
  today: () => todayString(),
  daysAgo: (n) => addDays(todayString(), -n)
};
