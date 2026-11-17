const express = require('express');
const ctrl = require('../controllers/dashboardController');
const { verifyToken, verifyRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

router.get('/admin', verifyRole('admin'), ctrl.admin);
router.get('/faculty', verifyRole('faculty'), ctrl.faculty);

module.exports = router;
