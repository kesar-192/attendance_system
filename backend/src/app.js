const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const mongoSanitize = require('express-mongo-sanitize');

const env = require('./config/env');
const { buildRateLimiters } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp(options = {}) {
  const app = express();
  const { apiLimiter, authLimiter } = buildRateLimiters(options.rateLimit);

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  // ---- security hardening
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // non-browser clients (curl, server-to-server) send no Origin header
        if (!origin || env.CORS_ORIGIN.includes('*') || env.CORS_ORIGIN.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition'],
      maxAge: 600
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(mongoSanitize()); // strips "$" and "." operator keys from body / query / params
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // ---- health (used by Docker / load balancers)
  app.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ success: dbUp, data: { status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' } });
  });

  // ---- API
  app.use('/api', apiLimiter);
  app.use('/api/auth', require('./routes/authRoutes')(authLimiter));
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/courses', require('./routes/courseRoutes'));
  app.use('/api/subjects', require('./routes/subjectRoutes'));
  app.use('/api/students', require('./routes/studentRoutes'));
  app.use('/api/faculty', require('./routes/facultyRoutes'));
  app.use('/api/attendance', require('./routes/attendanceRoutes'));
  app.use('/api/leaves', require('./routes/leaveRoutes'));
  app.use('/api/timetable', require('./routes/timetableRoutes'));
  app.use('/api/notifications', require('./routes/notificationRoutes'));
  app.use('/api/dashboard', require('./routes/dashboardRoutes'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const app = createApp();
app.createApp = createApp;
module.exports = app;
