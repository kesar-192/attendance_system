/**
 * Usage:
 *   npm run seed                 -> creates the admin account from SEED_ADMIN_* (idempotent)
 *   npm run seed:demo            -> admin + demo courses, faculty, students, attendance, leaves, timetable
 *   node src/seed.js --demo --reset  -> wipes the database first (never allowed in production)
 */
const mongoose = require('mongoose');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Course = require('./models/Course');
const Faculty = require('./models/Faculty');
const Student = require('./models/Student');
const Subject = require('./models/Subject');
const Attendance = require('./models/Attendance');
const Leave = require('./models/Leave');
const Timetable = require('./models/Timetable');
const Notification = require('./models/Notification');
const { parseDateOnly, todayString, addDays } = require('./utils/dates');

const args = new Set(process.argv.slice(2));
const DEMO_PASSWORD = 'Password@123';

// tiny deterministic PRNG so demo data is the same on every run
function prng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@campusflow.local').toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return existing;
  }
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@123';
  if (env.isProd && password === 'ChangeMe@123') throw new Error('Set SEED_ADMIN_PASSWORD to a strong value before seeding production');
  const admin = await User.create({ name: process.env.SEED_ADMIN_NAME || 'System Admin', email, password, role: 'admin' });
  console.log(`Admin created: ${email}`);
  return admin;
}

async function seedDemo(admin) {
  if (await Course.exists({})) {
    console.log('Demo data skipped: courses already exist (use --reset to start over)');
    return;
  }
  const rand = prng(42);

  const [btech, bca] = await Course.create([
    { name: 'B.Tech Computer Science', code: 'BTCS', department: 'Computer Science', durationSemesters: 8 },
    { name: 'Bachelor of Computer Applications', code: 'BCA', department: 'Applications', durationSemesters: 6 }
  ]);

  const facultyInput = [
    { name: 'Dr. Meera Iyer', email: 'meera.iyer@campusflow.local', employeeId: 'EMP-001', department: 'Computer Science', designation: 'Professor' },
    { name: 'Prof. Arjun Menon', email: 'arjun.menon@campusflow.local', employeeId: 'EMP-002', department: 'Computer Science', designation: 'Associate Professor' },
    { name: 'Ms. Kavya Nair', email: 'kavya.nair@campusflow.local', employeeId: 'EMP-003', department: 'Applications', designation: 'Assistant Professor' }
  ];
  const faculty = [];
  for (const f of facultyInput) {
    const user = await User.create({ name: f.name, email: f.email, password: DEMO_PASSWORD, role: 'faculty' });
    faculty.push(await Faculty.create({ userId: user._id, employeeId: f.employeeId, department: f.department, designation: f.designation }));
  }

  const subjects = await Subject.create([
    { name: 'Data Structures', code: 'CS301', courseId: btech._id, facultyId: faculty[0]._id, semester: 3, credits: 4 },
    { name: 'Database Systems', code: 'CS302', courseId: btech._id, facultyId: faculty[1]._id, semester: 3, credits: 4 },
    { name: 'Operating Systems', code: 'CS303', courseId: btech._id, facultyId: faculty[0]._id, semester: 3, credits: 3 },
    { name: 'Web Technologies', code: 'BCA201', courseId: bca._id, facultyId: faculty[2]._id, semester: 2, credits: 3 },
    { name: 'Programming in Java', code: 'BCA202', courseId: bca._id, facultyId: faculty[2]._id, semester: 2, credits: 4 }
  ]);

  const names = [
    ['Aarav Sharma', btech, 3], ['Diya Patel', btech, 3], ['Rohan Gupta', btech, 3], ['Ananya Reddy', btech, 3],
    ['Vikram Singh', btech, 3], ['Isha Kapoor', btech, 3], ['Karthik Raman', bca, 2], ['Sneha Joshi', bca, 2],
    ['Rahul Verma', bca, 2], ['Priya Nambiar', bca, 2], ['Mohit Das', bca, 2], ['Lakshmi Pillai', bca, 2]
  ];
  const students = [];
  for (let i = 0; i < names.length; i += 1) {
    const [name, course, semester] = names[i];
    const user = await User.create({
      name,
      email: `${name.split(' ')[0].toLowerCase()}@student.campusflow.local`,
      password: DEMO_PASSWORD,
      role: 'student'
    });
    students.push(
      await Student.create({ userId: user._id, courseId: course._id, enrollmentNo: `${course.code}2024${String(i + 1).padStart(3, '0')}`, semester })
    );
  }

  // each student gets an attendance "habit"; a few are deliberately below 75%
  const habit = students.map((_, i) => (i % 5 === 2 ? 0.55 + rand() * 0.1 : 0.82 + rand() * 0.15));
  const today = todayString();
  const days = [];
  for (let back = 0; days.length < 20 && back < 60; back += 1) {
    const d = addDays(today, -back);
    const weekday = parseDateOnly(d).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d);
  }

  const records = [];
  subjects.forEach((subject) => {
    const owner = faculty.find((f) => String(f._id) === String(subject.facultyId));
    students.forEach((student, idx) => {
      if (String(student.courseId) !== String(subject.courseId) || student.semester !== subject.semester) return;
      days.forEach((d) => {
        const roll = rand();
        const status = roll < habit[idx] ? (rand() < 0.06 ? 'late' : 'present') : 'absent';
        records.push({
          studentId: student._id,
          subjectId: subject._id,
          date: parseDateOnly(d),
          status,
          method: 'manual',
          markedBy: owner.userId
        });
      });
    });
  });
  await Attendance.insertMany(records);

  const slot = (subject, dayOfWeek, startTime, endTime, room) => ({
    courseId: subject.courseId,
    semester: subject.semester,
    subjectId: subject._id,
    facultyId: subject.facultyId,
    dayOfWeek,
    startTime,
    endTime,
    room
  });
  await Timetable.create([
    slot(subjects[0], 'Monday', '09:00', '10:00', 'A-101'),
    slot(subjects[1], 'Monday', '10:15', '11:15', 'A-101'),
    slot(subjects[2], 'Tuesday', '09:00', '10:00', 'A-102'),
    slot(subjects[0], 'Wednesday', '09:00', '10:00', 'A-101'),
    slot(subjects[1], 'Thursday', '11:30', '12:30', 'A-103'),
    slot(subjects[2], 'Friday', '10:00', '11:00', 'A-102'),
    slot(subjects[3], 'Monday', '09:00', '10:00', 'B-201'),
    slot(subjects[4], 'Tuesday', '10:15', '11:15', 'B-201'),
    slot(subjects[3], 'Thursday', '09:00', '10:00', 'B-202')
  ]);

  await Leave.create([
    { studentId: students[0]._id, type: 'sick', fromDate: parseDateOnly(addDays(today, 1)), toDate: parseDateOnly(addDays(today, 2)), reason: 'Viral fever, doctor advised rest' },
    {
      studentId: students[1]._id,
      type: 'event',
      fromDate: parseDateOnly(addDays(today, -10)),
      toDate: parseDateOnly(addDays(today, -9)),
      reason: 'Inter-college hackathon participation',
      status: 'approved',
      reviewedBy: faculty[0].userId,
      reviewedAt: new Date(),
      reviewComment: 'Approved. Share the certificate.'
    }
  ]);

  await Notification.create([
    { userId: admin._id, title: 'Demo data loaded', message: 'CampusFlow demo courses, faculty and students are ready.', type: 'system' },
    { userId: faculty[0].userId, title: 'New leave request', message: 'Aarav Sharma requested leave.', type: 'leave', link: '/leaves' }
  ]);

  console.log('\nDemo data created. Log in with password "' + DEMO_PASSWORD + '":');
  console.log('  faculty : meera.iyer@campusflow.local');
  console.log('  student : aarav@student.campusflow.local  (and others, rohan@ and sneha@ are deliberately below 75%)');
}

async function main() {
  if (args.has('--reset') && env.isProd) throw new Error('--reset is not allowed in production');
  if (args.has('--demo') && env.isProd && !args.has('--force')) throw new Error('Refusing to load demo data in production (use --force to override)');

  await connectDB();
  if (args.has('--reset')) {
    await mongoose.connection.dropDatabase();
    console.log('Database dropped');
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const admin = await seedAdmin();
  if (args.has('--demo')) await seedDemo(admin);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
