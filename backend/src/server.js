const mongoose = require('mongoose');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');

async function start() {
  try {
    await connectDB();
    console.log('MongoDB connected');
    // build unique indexes (enrollmentNo, employeeId, attendance date+subject+student, ...) before serving traffic
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  } catch (error) {
    console.error('Unable to start application:', error.message);
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => console.log(`CampusFlow API listening on port ${env.PORT} (${env.NODE_ENV})`));

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
}

if (require.main === module) start();

module.exports = start;
