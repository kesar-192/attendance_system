const express = require('express');
const ctrl = require('../controllers/studentController');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { validateIdParam } = require('../utils/helpers');

const router = express.Router();
router.param('id', validateIdParam);
router.use(verifyToken);

// self-service (declared before /:id so "me" is never treated as an id)
router.get('/me', verifyRole('student'), ctrl.getMe);
router.patch('/me', verifyRole('student'), ctrl.updateMe);

// admin CRUD
router.get('/', verifyRole('admin'), ctrl.list);
router.post('/', verifyRole('admin'), ctrl.create);
router.get('/:id', verifyRole('admin'), ctrl.getOne);
router.patch('/:id', verifyRole('admin'), ctrl.update);
router.delete('/:id', verifyRole('admin'), ctrl.remove);

module.exports = router;
