const express = require('express');
const ctrl = require('../controllers/authController');
const { verifyToken, verifyRole } = require('../middleware/auth');

module.exports = (authLimiter) => {
  const router = express.Router();
  router.post('/login', authLimiter, ctrl.login);
  router.post('/register', verifyToken, verifyRole('admin'), ctrl.registerAdmin);
  router.get('/me', verifyToken, ctrl.me);
  router.post('/change-password', verifyToken, ctrl.changePassword);
  return router;
};
