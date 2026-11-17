/**
 * Uses TEST_MONGO_URI when provided (CI / Docker), otherwise starts an in-memory MongoDB.
 * Every test file gets its own database, so files never see each other's data.
 */
module.exports = async () => {
  if (process.env.TEST_MONGO_URI) return;
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  process.env.TEST_MONGO_URI = mongod.getUri();
  globalThis.__MONGOD__ = mongod;
};
