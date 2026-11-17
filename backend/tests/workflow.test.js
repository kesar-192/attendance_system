const request = require('supertest');
const app = require('../src/app');
const Notification = require('../src/models/Notification');
const Timetable = require('../src/models/Timetable');
const h = require('./helpers');

beforeAll(h.connectTestDb);
afterAll(h.disconnectTestDb);
beforeEach(h.clearDb);

const future = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const applyLeave = (token, body = {}) =>
  request(app).post('/api/leaves').set(h.bearer(token)).send({ type: 'sick', fromDate: future(3), toDate: future(4), reason: 'Viral fever and rest', ...body });

describe('Leave workflow', () => {
  test('student applies -> relevant faculty + admins are notified; unrelated faculty are not', async () => {
    const ctx = await h.createSchool();
    const res = await applyLeave(ctx.students[0].token);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.studentId.userId.name).toBe(ctx.students[0].user.name);

    const notified = (await Notification.find({ type: 'leave' })).map((n) => String(n.userId));
    expect(notified).toEqual(expect.arrayContaining([String(ctx.facultyA.user._id), String(ctx.admin.user._id)]));
    expect(notified).not.toContain(String(ctx.facultyB.user._id));
    expect(notified).not.toContain(String(ctx.students[0].user._id));
  });

  test('validation: dates, ordering, reason, type, overlap, maximum length', async () => {
    const ctx = await h.createSchool();
    const t = ctx.students[0].token;
    expect((await applyLeave(t, { fromDate: 'tomorrow' })).status).toBe(400);
    expect((await applyLeave(t, { fromDate: future(5), toDate: future(4) })).status).toBe(400);
    expect((await applyLeave(t, { reason: 'no' })).status).toBe(400);
    expect((await applyLeave(t, { type: 'vacation' })).status).toBe(400);
    expect((await applyLeave(t, { fromDate: future(1), toDate: future(200) })).status).toBe(400);
    expect((await applyLeave(t)).status).toBe(201);
    expect((await applyLeave(t, { fromDate: future(4), toDate: future(6) })).status).toBe(409); // overlaps
    expect((await applyLeave(t, { fromDate: future(5), toDate: future(6) })).status).toBe(201); // adjacent days are fine
  });

  test('the course faculty can approve; second review conflicts; the student is notified', async () => {
    const ctx = await h.createSchool();
    const leave = (await applyLeave(ctx.students[0].token)).body.data;

    const res = await request(app).patch(`/api/leaves/${leave._id}/review`).set(h.bearer(ctx.facultyA.token)).send({ status: 'approved', comment: 'Get well soon' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'approved', reviewComment: 'Get well soon' });
    expect(res.body.data.reviewedBy.name).toBe(ctx.facultyA.user.name);

    const note = await Notification.findOne({ userId: ctx.students[0].user._id, type: 'leave' });
    expect(note.title).toBe('Leave approved');
    expect(note.message).toContain('Get well soon');

    const again = await request(app).patch(`/api/leaves/${leave._id}/review`).set(h.bearer(ctx.admin.token)).send({ status: 'rejected' });
    expect(again.status).toBe(409);
  });

  test('faculty who do not teach the student’s course cannot see or review the request', async () => {
    const ctx = await h.createSchool();
    const leave = (await applyLeave(ctx.students[0].token)).body.data;
    const review = await request(app).patch(`/api/leaves/${leave._id}/review`).set(h.bearer(ctx.facultyB.token)).send({ status: 'approved' });
    expect(review.status).toBe(404);
    const list = await request(app).get('/api/leaves').set(h.bearer(ctx.facultyB.token));
    expect(list.body.meta.total).toBe(0);
    expect((await request(app).get('/api/leaves').set(h.bearer(ctx.facultyA.token))).body.meta.total).toBe(1);
  });

  test('admin can reject; invalid review status -> 400; status filter works', async () => {
    const ctx = await h.createSchool();
    const a = (await applyLeave(ctx.students[0].token)).body.data;
    await applyLeave(ctx.students[1].token);
    expect((await request(app).patch(`/api/leaves/${a._id}/review`).set(h.bearer(ctx.admin.token)).send({ status: 'maybe' })).status).toBe(400);
    expect((await request(app).patch(`/api/leaves/${a._id}/review`).set(h.bearer(ctx.admin.token)).send({ status: 'rejected' })).body.data.status).toBe('rejected');
    expect((await request(app).get('/api/leaves?status=pending').set(h.bearer(ctx.admin.token))).body.meta.total).toBe(1);
    expect((await request(app).get('/api/leaves?status=rejected').set(h.bearer(ctx.admin.token))).body.meta.total).toBe(1);
    expect((await request(app).get('/api/leaves?status=wat').set(h.bearer(ctx.admin.token))).status).toBe(400);
  });

  test('students see only their own requests and can cancel pending ones only', async () => {
    const ctx = await h.createSchool();
    const mine = (await applyLeave(ctx.students[0].token)).body.data;
    await applyLeave(ctx.students[1].token);
    expect((await request(app).get('/api/leaves').set(h.bearer(ctx.students[0].token))).body.meta.total).toBe(1);
    expect((await request(app).patch(`/api/leaves/${mine._id}/cancel`).set(h.bearer(ctx.students[1].token))).status).toBe(404);

    const cancelled = await request(app).patch(`/api/leaves/${mine._id}/cancel`).set(h.bearer(ctx.students[0].token));
    expect(cancelled.body.data.status).toBe('cancelled');

    const other = (await applyLeave(ctx.students[2].token)).body.data;
    await request(app).patch(`/api/leaves/${other._id}/review`).set(h.bearer(ctx.admin.token)).send({ status: 'approved' });
    expect((await request(app).patch(`/api/leaves/${other._id}/cancel`).set(h.bearer(ctx.students[2].token))).status).toBe(409);
  });
});

describe('Timetable', () => {
  const slot = (subject, over = {}) => ({ subjectId: String(subject._id), dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:00', room: 'A-1', ...over });

  test('admin CRUD; course, semester and faculty are derived from the subject', async () => {
    const ctx = await h.createSchool();
    const res = await request(app).post('/api/timetable').set(h.bearer(ctx.admin.token)).send(slot(ctx.subject));
    expect(res.status).toBe(201);
    expect(res.body.data.subjectId.code).toBe(ctx.subject.code);
    expect(res.body.data.semester).toBe(3);
    expect(res.body.data.facultyId._id).toBe(String(ctx.facultyA.profile._id));

    const upd = await request(app).patch(`/api/timetable/${res.body.data._id}`).set(h.bearer(ctx.admin.token)).send({ room: 'B-7', startTime: '09:30', endTime: '10:30' });
    expect(upd.body.data).toMatchObject({ room: 'B-7', startTime: '09:30' });
    expect((await request(app).delete(`/api/timetable/${res.body.data._id}`).set(h.bearer(ctx.admin.token))).status).toBe(200);
    expect(await Timetable.countDocuments()).toBe(0);
  });

  test('rejects bad times and clashes (same faculty or same class) but allows back-to-back slots', async () => {
    const ctx = await h.createSchool();
    const sameFacultySubject = await h.createSubject(ctx.course, ctx.facultyA, { semester: 5 });
    const sameClassSubject = await h.createSubject(ctx.course, ctx.facultyB, { semester: 3 });
    const post = (body) => request(app).post('/api/timetable').set(h.bearer(ctx.admin.token)).send(body);

    expect((await post(slot(ctx.subject))).status).toBe(201);
    expect((await post(slot(ctx.subject, { startTime: '10:00', endTime: '09:00' }))).status).toBe(400);
    expect((await post(slot(ctx.subject, { startTime: '9am' }))).status).toBe(400);
    expect((await post(slot(ctx.subject, { dayOfWeek: 'Funday' }))).status).toBe(400);
    expect((await post(slot(sameFacultySubject, { startTime: '09:30', endTime: '10:30' }))).status).toBe(409); // faculty double-booked
    expect((await post(slot(sameClassSubject, { startTime: '09:30', endTime: '10:30' }))).status).toBe(409); // class double-booked
    expect((await post(slot(sameClassSubject, { startTime: '10:00', endTime: '11:00' }))).status).toBe(201); // back-to-back
    expect((await post(slot(sameFacultySubject, { dayOfWeek: 'Tuesday' }))).status).toBe(201);
    expect((await post({ ...slot(ctx.subject), subjectId: '64b7f0f0f0f0f0f0f0f0f0f0' })).status).toBe(404);
  });

  test('students see only their own class timetable; faculty can filter to their own slots; list is day-ordered', async () => {
    const ctx = await h.createSchool();
    const otherCourse = await h.createCourse();
    const foreignSubject = await h.createSubject(otherCourse, ctx.facultyB);
    const second = await h.createSubject(ctx.course, ctx.facultyB);
    const post = (body) => request(app).post('/api/timetable').set(h.bearer(ctx.admin.token)).send(body);
    await post(slot(ctx.subject, { dayOfWeek: 'Wednesday' }));
    await post(slot(second, { dayOfWeek: 'Monday', startTime: '11:00', endTime: '12:00' }));
    await post(slot(foreignSubject));

    const student = await request(app).get('/api/timetable').set(h.bearer(ctx.students[0].token));
    expect(student.body.data.map((e) => e.dayOfWeek)).toEqual(['Monday', 'Wednesday']);
    const spoof = await request(app).get(`/api/timetable?courseId=${otherCourse._id}`).set(h.bearer(ctx.students[0].token));
    expect(spoof.body.data).toHaveLength(2); // filter cannot be widened
    const mine = await request(app).get('/api/timetable?mine=true').set(h.bearer(ctx.facultyB.token));
    expect(mine.body.data).toHaveLength(2);
    expect((await request(app).get('/api/timetable?dayOfWeek=Funday').set(h.bearer(ctx.admin.token))).status).toBe(400);
  });

  test('reassigning a subject keeps timetable entries in sync', async () => {
    const ctx = await h.createSchool();
    await request(app).post('/api/timetable').set(h.bearer(ctx.admin.token)).send(slot(ctx.subject));
    await request(app).patch(`/api/subjects/${ctx.subject._id}`).set(h.bearer(ctx.admin.token)).send({ facultyId: String(ctx.facultyB.profile._id), semester: 4 });
    const entry = await Timetable.findOne();
    expect(String(entry.facultyId)).toBe(String(ctx.facultyB.profile._id));
    expect(entry.semester).toBe(4);
  });
});

describe('Notifications', () => {
  test('users only see and manage their own notifications', async () => {
    const ctx = await h.createSchool();
    const mine = await Notification.create([
      { userId: ctx.students[0].user._id, title: 'A', message: 'first' },
      { userId: ctx.students[0].user._id, title: 'B', message: 'second' }
    ]);
    const others = await Notification.create({ userId: ctx.students[1].user._id, title: 'C', message: 'not yours' });
    const t = ctx.students[0].token;

    const list = await request(app).get('/api/notifications').set(h.bearer(t));
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta.unread).toBe(2);
    expect((await request(app).get('/api/notifications/unread-count').set(h.bearer(t))).body.data.unread).toBe(2);

    expect((await request(app).patch(`/api/notifications/${others._id}/read`).set(h.bearer(t))).status).toBe(404);
    expect((await request(app).delete(`/api/notifications/${others._id}`).set(h.bearer(t))).status).toBe(404);
    expect((await request(app).patch(`/api/notifications/${mine[0]._id}/read`).set(h.bearer(t))).body.data.read).toBe(true);
    expect((await request(app).get('/api/notifications?unread=true').set(h.bearer(t))).body.data).toHaveLength(1);

    expect((await request(app).patch('/api/notifications/read-all').set(h.bearer(t))).body.data.updated).toBe(1);
    expect((await request(app).get('/api/notifications/unread-count').set(h.bearer(t))).body.data.unread).toBe(0);
    expect((await request(app).delete(`/api/notifications/${mine[1]._id}`).set(h.bearer(t))).status).toBe(200);
    expect((await Notification.findById(others._id)).read).toBe(false);
  });

  test('admin broadcast to a role or to specific users', async () => {
    const ctx = await h.createSchool();
    const post = (body) => request(app).post('/api/notifications').set(h.bearer(ctx.admin.token)).send(body);
    const toStudents = await post({ title: 'Holiday', message: 'Campus closed on Friday', role: 'student' });
    expect(toStudents.status).toBe(201);
    expect(toStudents.body.data.sent).toBe(5);
    const toOne = await post({ title: 'Hi', message: 'Just you', userIds: [String(ctx.facultyA.user._id)] });
    expect(toOne.body.data.sent).toBe(1);
    expect((await post({ title: 'x', message: 'y' })).status).toBe(400);
    expect((await post({ title: 'x', message: 'y', role: 'janitor' })).status).toBe(400);
    expect((await post({ message: 'y', role: 'student' })).status).toBe(400);
  });
});

describe('Dashboards', () => {
  test('admin dashboard totals, department analytics and shortage count', async () => {
    const ctx = await h.createSchool();
    const mark = (date, status) =>
      request(app).post('/api/attendance/bulk').set(h.bearer(ctx.facultyA.token)).send({
        subjectId: String(ctx.subject._id),
        date,
        records: ctx.students.map((s, i) => ({ studentId: String(s.profile._id), status: i === 0 ? 'absent' : status }))
      });
    await mark(h.daysAgo(1), 'present');
    await mark(h.daysAgo(2), 'present');
    await applyLeave(ctx.students[1].token);

    const res = await request(app).get('/api/dashboard/admin').set(h.bearer(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({ students: 5, faculty: 2, courses: 1, subjects: 1, pendingLeaves: 1, lowAttendanceStudents: 1 });
    expect(res.body.data.overallAttendance).toBe(75);
    expect(res.body.data.departmentAnalytics[0]).toMatchObject({ department: 'Computer Science', students: 5, attendancePercentage: 75 });
    expect(res.body.data.studentsByCourse[0].students).toBe(5);
    expect(res.body.data.trend).toHaveLength(2);
  });

  test('faculty dashboard lists their subjects with stats and today’s classes', async () => {
    const ctx = await h.createSchool();
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${h.today()}T00:00:00Z`).getUTCDay()];
    await request(app).post('/api/timetable').set(h.bearer(ctx.admin.token)).send({ subjectId: String(ctx.subject._id), dayOfWeek: day, startTime: '09:00', endTime: '10:00' });
    await request(app).post('/api/attendance/bulk').set(h.bearer(ctx.facultyA.token)).send({
      subjectId: String(ctx.subject._id),
      date: h.today(),
      records: [{ studentId: String(ctx.students[0].profile._id), status: 'absent' }]
    });

    const res = await request(app).get('/api/dashboard/faculty').set(h.bearer(ctx.facultyA.token));
    expect(res.status).toBe(200);
    expect(res.body.data.subjects).toHaveLength(1);
    expect(res.body.data.subjects[0]).toMatchObject({ code: ctx.subject.code, enrolledStudents: 4, lowAttendanceStudents: 1, percentage: 0 });
    expect(res.body.data.todayClasses).toHaveLength(1);

    const empty = await request(app).get('/api/dashboard/faculty').set(h.bearer(ctx.facultyB.token));
    expect(empty.body.data.subjects).toEqual([]);
  });
});
