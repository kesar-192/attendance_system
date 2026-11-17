const express = require('express');
const ctrl = require('../controllers/leaveController');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { validateIdParam } = require('../utils/helpers');

const router = express.Router();
router.param('id', validateIdParam);
router.use(verifyToken);

router.post('/', verifyRole('student'), ctrl.apply);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.patch('/:id/review', verifyRole('admin', 'faculty'), ctrl.review);
router.patch('/:id/cancel', verifyRole('student'), ctrl.cancel);

module.exports = router;
