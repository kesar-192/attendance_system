const express = require('express');
const ctrl = require('../controllers/facultyController');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { validateIdParam } = require('../utils/helpers');

const router = express.Router();
router.param('id', validateIdParam);
router.use(verifyToken);

router.get('/me', verifyRole('faculty'), ctrl.getMe);
router.patch('/me', verifyRole('faculty'), ctrl.updateMe);

router.get('/', verifyRole('admin'), ctrl.list);
router.post('/', verifyRole('admin'), ctrl.create);
router.get('/:id', verifyRole('admin'), ctrl.getOne);
router.patch('/:id', verifyRole('admin'), ctrl.update);
router.delete('/:id', verifyRole('admin'), ctrl.remove);

module.exports = router;
