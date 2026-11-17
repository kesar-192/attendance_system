const express = require('express');
const ctrl = require('../controllers/qrController');
const { verifyRole } = require('../middleware/auth');
const { validateIdParam } = require('../utils/helpers');

// mounted at /api/attendance/qr (verifyToken is applied by the parent router)
const router = express.Router();
router.param('sessionId', validateIdParam);

router.post('/generate', verifyRole('admin', 'faculty'), ctrl.generate);
router.post('/scan', verifyRole('student'), ctrl.scan);
router.get('/:sessionId', verifyRole('admin', 'faculty'), ctrl.status);
router.post('/:sessionId/refresh', verifyRole('admin', 'faculty'), ctrl.refresh);
router.post('/:sessionId/close', verifyRole('admin', 'faculty'), ctrl.close);

module.exports = router;
