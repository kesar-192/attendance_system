require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const mongoose = require('mongoose');
const User = require('./src/models/User');

const ADMIN = {
  name: 'System Admin',
  email: 'admin@campusflow.local',
  role: 'admin',
  isActive: true
};

async function main() {
  try {
    if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in backend/.env');
    if (!process.env.SEED_ADMIN_PASSWORD) throw new Error('Set SEED_ADMIN_PASSWORD in backend/.env');

    await mongoose.connect(process.env.MONGO_URI);

    const existing = await User.findOne({ email: ADMIN.email });
    if (existing) {
      console.log(`Admin already exists: ${ADMIN.email}`);
      return;
    }

    await User.create({ ...ADMIN, password: process.env.SEED_ADMIN_PASSWORD });
    console.log(`Admin created: ${ADMIN.email}`);
  } catch (error) {
    console.error('Admin seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Admin seed failed:', error.message);
  process.exitCode = 1;
});
