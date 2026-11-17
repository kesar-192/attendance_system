const express = require('express');
const ctrl = require('../controllers/attendanceController');
const qrRoutes = require('./qrRoutes');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { validateIdParam } = require('../utils/helpers');

const router = express.Router();
router.param('id', validateIdParam);
router.param('studentId', validateIdParam);
router.use(verifyToken);

router.use('/qr', qrRoutes);

// faculty / admin tooling
router.post('/bulk', verifyRole('admin', 'faculty'), ctrl.bulkMark);
router.get('/roster', verifyRole('admin', 'faculty'), ctrl.roster);
router.get('/reports', verifyRole('admin', 'faculty'), ctrl.reports);
router.get('/trends', verifyRole('admin', 'faculty'), ctrl.trends);

// summaries ("me" before :studentId)
router.get('/summary/me', verifyRole('student'), ctrl.summaryMe);
router.get('/summary/:studentId', ctrl.summaryForStudent);

// role-scoped list + corrections
router.get('/', ctrl.list);
router.patch('/:id', verifyRole('admin', 'faculty'), ctrl.update);
router.delete('/:id', verifyRole('admin'), ctrl.remove);

module.exports = router;
