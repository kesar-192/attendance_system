const request = require('supertest');
const app = require('../src/app');
const Leave = require('../src/models/Leave');
const Attendance = require('../src/models/Attendance');
const h = require('./helpers');

beforeAll(h.connectTestDb);
afterAll(h.disconnectTestDb);
beforeEach(h.clearDb);

describe('RBAC matrix', () => {
  let ctx;
  let leave;
  beforeEach(async () => {
    ctx = await h.createSchool();
    leave = await Leave.create({
      studentId: ctx.students[0].profile._id,
      fromDate: new Date('2030-01-01T00:00:00Z'),
      toDate: new Date('2030-01-02T00:00:00Z'),
      reason: 'Family function'
    });
  });

  // [method, path builder, { role: expected status }]   (only roles that must be refused / accepted are listed)
  const matrix = [
    ['get', () => '/api/users', { admin: 200, faculty: 403, student: 403 }],
    ['get', () => '/api/students', { admin: 200, faculty: 403, student: 403 }],
    ['post', () => '/api/students', { faculty: 403, student: 403 }],
    ['get', () => '/api/students/me', { admin: 403, faculty: 403, student: 200 }],
    ['get', () => '/api/faculty', { admin: 200, faculty: 403, student: 403 }],
    ['post', () => '/api/faculty', { faculty: 403, student: 403 }],
    ['get', () => '/api/faculty/me', { admin: 403, faculty: 200, student: 403 }],
    ['get', () => '/api/courses', { admin: 200, faculty: 200, student: 200 }],
    ['post', () => '/api/courses', { faculty: 403, student: 403 }],
    ['get', () => '/api/subjects', { admin: 200, faculty: 200, student: 200 }],
    ['post', () => '/api/subjects', { student: 403 }],
    ['post', () => '/api/attendance/bulk', { student: 403 }],
    ['get', () => '/api/attendance/roster', { student: 403 }],
    ['get', () => '/api/attendance/reports', { admin: 200, faculty: 200, student: 403 }],
    ['get', () => '/api/attendance/trends', { admin: 200, faculty: 200, student: 403 }],
    ['get', () => '/api/attendance/summary/me', { admin: 403, faculty: 403, student: 200 }],
    ['post', () => '/api/attendance/qr/generate', { student: 403 }],
    ['post', () => '/api/attendance/qr/scan', { admin: 403, faculty: 403 }],
    ['post', () => '/api/leaves', { admin: 403, faculty: 403 }],
    ['get', () => '/api/leaves', { admin: 200, faculty: 200, student: 200 }],
    ['patch', () => `/api/leaves/${leave._id}/review`, { student: 403 }],
    ['patch', () => `/api/leaves/${leave._id}/cancel`, { admin: 403, faculty: 403 }],
    ['get', () => '/api/timetable', { admin: 200, faculty: 200, student: 200 }],
    ['post', () => '/api/timetable', { faculty: 403, student: 403 }],
    ['post', () => '/api/notifications', { faculty: 403, student: 403 }],
    ['get', () => '/api/notifications', { admin: 200, faculty: 200, student: 200 }],
    ['get', () => '/api/dashboard/admin', { admin: 200, faculty: 403, student: 403 }],
    ['get', () => '/api/dashboard/faculty', { admin: 403, faculty: 200, student: 403 }]
  ];

  test.each(matrix)('%s route enforces roles', async (method, path, expectations) => {
    const tokens = { admin: ctx.admin.token, faculty: ctx.facultyA.token, student: ctx.students[0].token };
    // 401 for anonymous callers on every protected route
    expect((await request(app)[method](path())).status).toBe(401);

    for (const [role, expected] of Object.entries(expectations)) {
      const res = await request(app)[method](path()).set(h.bearer(tokens[role])).send({});
      if (expected === 403) {
        expect([role, res.status]).toEqual([role, 403]);
      } else {
        expect([role, res.status]).toEqual([role, expected]);
      }
    }
  });
});

describe('ownership & data isolation', () => {
  test('faculty can manage only their own subjects', async () => {
    const { facultyA, facultyB, subject, students } = await h.createSchool();
    const edit = (token) => request(app).patch(`/api/subjects/${subject._id}`).set(h.bearer(token)).send({ credits: 5 });
    expect((await edit(facultyB.token)).status).toBe(403);
    expect((await edit(facultyA.token)).status).toBe(200);

    const del = await request(app).delete(`/api/subjects/${subject._id}`).set(h.bearer(facultyB.token));
    expect(del.status).toBe(403);

    const bulk = await request(app)
      .post('/api/attendance/bulk')
      .set(h.bearer(facultyB.token))
      .send({ subjectId: String(subject._id), date: h.today(), records: [{ studentId: String(students[0].profile._id), status: 'present' }] });
    expect(bulk.status).toBe(403);
    expect(await Attendance.countDocuments()).toBe(0);
  });

  test('faculty cannot read attendance of subjects they do not teach', async () => {
    const { facultyB, subject } = await h.createSchool();
    const list = await request(app).get(`/api/attendance?subjectId=${subject._id}`).set(h.bearer(facultyB.token));
    expect(list.status).toBe(403);
    const reports = await request(app).get(`/api/attendance/reports?subjectId=${subject._id}`).set(h.bearer(facultyB.token));
    expect(reports.status).toBe(403);
    const roster = await request(app).get(`/api/attendance/roster?subjectId=${subject._id}`).set(h.bearer(facultyB.token));
    expect(roster.status).toBe(403);
  });

  test('a student sees only their own attendance and summary', async () => {
    const { facultyA, subject, students } = await h.createSchool();
    await request(app)
      .post('/api/attendance/bulk')
      .set(h.bearer(facultyA.token))
      .send({ subjectId: String(subject._id), date: h.today(), records: students.map((s) => ({ studentId: String(s.profile._id), status: 'present' })) });

    const mine = await request(app).get('/api/attendance').set(h.bearer(students[0].token));
    expect(mine.body.meta.total).toBe(1);
    expect(mine.body.data[0].studentId._id).toBe(String(students[0].profile._id));

    // trying to widen the scope with ?studentId= is ignored
    const spoof = await request(app).get(`/api/attendance?studentId=${students[1].profile._id}`).set(h.bearer(students[0].token));
    expect(spoof.body.meta.total).toBe(1);
    expect(spoof.body.data[0].studentId._id).toBe(String(students[0].profile._id));

    const other = await request(app).get(`/api/attendance/summary/${students[1].profile._id}`).set(h.bearer(students[0].token));
    expect(other.status).toBe(403);
    const own = await request(app).get(`/api/attendance/summary/${students[0].profile._id}`).set(h.bearer(students[0].token));
    expect(own.status).toBe(200);
  });

  test('students cannot read other students’ leave requests', async () => {
    const { students } = await h.createSchool();
    const leave = await Leave.create({
      studentId: students[0].profile._id,
      fromDate: new Date('2030-02-01T00:00:00Z'),
      toDate: new Date('2030-02-01T00:00:00Z'),
      reason: 'Doctor appointment'
    });
    expect((await request(app).get(`/api/leaves/${leave._id}`).set(h.bearer(students[1].token))).status).toBe(404);
    expect((await request(app).get(`/api/leaves/${leave._id}`).set(h.bearer(students[0].token))).status).toBe(200);
  });

  test('privilege escalation attempts through profile updates are ignored', async () => {
    const { students, course } = await h.createSchool();
    const otherCourse = await h.createCourse();
    const res = await request(app)
      .patch('/api/students/me')
      .set(h.bearer(students[0].token))
      .send({ phone: '9876543210', courseId: String(otherCourse._id), enrollmentNo: 'HACKED1', semester: 8, role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('9876543210');
    expect(res.body.data.enrollmentNo).toBe(students[0].profile.enrollmentNo);
    expect(res.body.data.semester).toBe(3);
    expect(res.body.data.courseId._id).toBe(String(course._id));
    expect(res.body.data.userId.role).toBeUndefined();
  });
});
