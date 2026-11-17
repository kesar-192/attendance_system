const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const h = require('./helpers');

beforeAll(h.connectTestDb);
afterAll(h.disconnectTestDb);
beforeEach(h.clearDb);

describe('POST /api/auth/login', () => {
  test('returns a JWT, the user (without password) and the role profile', async () => {
    const course = await h.createCourse();
    const student = await h.createStudent(course);

    const res = await request(app).post('/api/auth/login').send({ email: student.user.email, password: h.PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.role).toBe('student');
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.profile.enrollmentNo).toBe(student.profile.enrollmentNo);
    expect(res.body.data.profile.courseId.code).toBe(course.code);

    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(decoded.sub).toBe(String(student.user._id));
    expect(decoded.role).toBe('student');
  });

  test('email is case-insensitive', async () => {
    const { user } = await h.createAdmin();
    const res = await request(app).post('/api/auth/login').send({ email: user.email.toUpperCase(), password: h.PASSWORD });
    expect(res.status).toBe(200);
  });

  test('wrong password and unknown email return the same 401 message', async () => {
    const { user } = await h.createAdmin();
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: user.email, password: 'nope-nope-1' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ghost@test.dev', password: h.PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.success).toBe(false);
  });

  test('rejects missing / non-string credentials (400) including NoSQL operator payloads', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.co' })).status).toBe(400);
    const injection = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(injection.status).toBe(400);
  });

  test('deactivated accounts cannot log in', async () => {
    const { user } = await h.createAdmin();
    await User.updateOne({ _id: user._id }, { isActive: false });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: h.PASSWORD });
    expect(res.status).toBe(403);
  });

  test('brute-force protection: the login limiter answers 429 after too many failures', async () => {
    const limited = app.createApp({ rateLimit: { enabled: true, authMax: 3, apiMax: 1000 } });
    const { user } = await h.createAdmin();
    const attempt = () => request(limited).post('/api/auth/login').send({ email: user.email, password: 'wrong-pass-1' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
  });
});

describe('verifyToken middleware', () => {
  test('401 without a token, with a malformed header and with garbage', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Token abc')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(h.bearer('not.a.jwt'))).status).toBe(401);
  });

  test('401 for expired tokens and tokens signed with another secret', async () => {
    const { user } = await h.createAdmin();
    const expired = await request(app).get('/api/auth/me').set(h.bearer(h.expiredToken(user)));
    expect(expired.status).toBe(401);
    expect(expired.body.message).toMatch(/expired/i);

    const forged = jwt.sign({ sub: String(user._id), role: 'admin' }, 'some-other-secret', { issuer: 'campusflow' });
    expect((await request(app).get('/api/auth/me').set(h.bearer(forged))).status).toBe(401);
  });

  test('a QR token can never be used as a login token', async () => {
    const { user } = await h.createAdmin();
    const qrToken = jwt.sign({ sid: String(user._id) }, process.env.QR_SECRET, { audience: 'campusflow:qr' });
    expect((await request(app).get('/api/auth/me').set(h.bearer(qrToken))).status).toBe(401);
  });

  test('role claims are not trusted: a deactivated user with a valid token is rejected', async () => {
    const { user, token } = await h.createAdmin();
    await User.updateOne({ _id: user._id }, { isActive: false });
    expect((await request(app).get('/api/auth/me').set(h.bearer(token))).status).toBe(401);
  });

  test('GET /api/auth/me returns the current user', async () => {
    const { user, token } = await h.createAdmin();
    const res = await request(app).get('/api/auth/me').set(h.bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
  });
});

describe('POST /api/auth/change-password', () => {
  test('changes the password, returns a fresh token and invalidates older tokens', async () => {
    const { user } = await h.createAdmin();
    const oldToken = jwt.sign({ sub: String(user._id), role: 'admin', iat: Math.floor(Date.now() / 1000) - 120 }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'campusflow',
      expiresIn: '1h'
    });
    expect((await request(app).get('/api/auth/me').set(h.bearer(oldToken))).status).toBe(200);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set(h.bearer(oldToken))
      .send({ currentPassword: h.PASSWORD, newPassword: 'NewPassw0rd!' });
    expect(res.status).toBe(200);

    expect((await request(app).get('/api/auth/me').set(h.bearer(oldToken))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(h.bearer(res.body.data.token))).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: 'NewPassw0rd!' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: h.PASSWORD })).status).toBe(401);
  });

  test('wrong current password -> 401, weak new password -> 400', async () => {
    const { token } = await h.createAdmin();
    const wrong = await request(app).post('/api/auth/change-password').set(h.bearer(token)).send({ currentPassword: 'bad', newPassword: 'NewPassw0rd!' });
    expect(wrong.status).toBe(401);
    const weak = await request(app).post('/api/auth/change-password').set(h.bearer(token)).send({ currentPassword: h.PASSWORD, newPassword: 'short' });
    expect(weak.status).toBe(400);
  });
});

describe('POST /api/auth/register (admin only)', () => {
  const payload = { name: 'New Admin', email: 'newadmin@test.dev', password: 'Str0ngPass!' };

  test('an admin can create another administrator; password is hashed', async () => {
    const { token } = await h.createAdmin();
    const res = await request(app).post('/api/auth/register').set(h.bearer(token)).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('admin');
    expect(res.body.data.password).toBeUndefined();
    const stored = await User.findOne({ email: payload.email }).select('+password');
    expect(stored.password).not.toBe(payload.password);
    expect(stored.password).toMatch(/^\$2[aby]\$/);
  });

  test('role cannot be escalated through the body (always admin-only endpoint)', async () => {
    const { token } = await h.createAdmin();
    const res = await request(app).post('/api/auth/register').set(h.bearer(token)).send({ ...payload, role: 'student' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('admin');
  });

  test('anonymous, faculty and student callers are refused', async () => {
    const course = await h.createCourse();
    const faculty = await h.createFaculty();
    const student = await h.createStudent(course);
    expect((await request(app).post('/api/auth/register').send(payload)).status).toBe(401);
    expect((await request(app).post('/api/auth/register').set(h.bearer(faculty.token)).send(payload)).status).toBe(403);
    expect((await request(app).post('/api/auth/register').set(h.bearer(student.token)).send(payload)).status).toBe(403);
  });

  test('validation (400) and duplicate email (409)', async () => {
    const { token } = await h.createAdmin();
    const weak = await request(app).post('/api/auth/register').set(h.bearer(token)).send({ ...payload, password: 'password' });
    expect(weak.status).toBe(400);
    expect(weak.body.errors[0].field).toBe('password');
    const badEmail = await request(app).post('/api/auth/register').set(h.bearer(token)).send({ ...payload, email: 'nope' });
    expect(badEmail.status).toBe(400);

    await request(app).post('/api/auth/register').set(h.bearer(token)).send(payload);
    const dup = await request(app).post('/api/auth/register').set(h.bearer(token)).send(payload);
    expect(dup.status).toBe(409);
    expect(dup.body.success).toBe(false);
  });
});

describe('platform behaviour', () => {
  test('GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.data.db).toBe('up');
  });

  test('security headers are set and x-powered-by is hidden', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('CORS only echoes allowed origins', async () => {
    const allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('unknown routes and malformed JSON use the standard error envelope', async () => {
    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: expect.stringContaining('Route not found') });

    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
  });

  test('operator injection in query strings is neutralised (never widens a filter)', async () => {
    const { token } = await h.createAdmin();
    await h.createCourse();
    const res = await request(app).get('/api/courses?q[$ne]=x').set(h.bearer(token));
    expect(res.status).toBe(400); // sanitizer strips "$ne"; the leftover object is refused
    expect(res.body.success).toBe(false);
    const students = await request(app).get('/api/students?courseId[$ne]=x').set(h.bearer(token));
    expect(students.status).toBe(400);
  });
});
