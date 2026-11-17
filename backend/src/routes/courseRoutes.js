const express = require('express');
const ctrl = require('../controllers/courseController');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { validateIdParam } = require('../utils/helpers');

const router = express.Router();
router.param('id', validateIdParam);
router.use(verifyToken);

// all roles read, admin writes
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', verifyRole('admin'), ctrl.create);
router.patch('/:id', verifyRole('admin'), ctrl.update);
router.delete('/:id', verifyRole('admin'), ctrl.remove);

module.exports = router;
