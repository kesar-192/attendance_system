const express = require('express');
const ctrl = require('../controllers/subjectController');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { validateIdParam } = require('../utils/helpers');

const router = express.Router();
router.param('id', validateIdParam);
router.use(verifyToken);

// all roles read; admin + faculty write (faculty are limited to their own subjects in the controller)
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', verifyRole('admin', 'faculty'), ctrl.create);
router.patch('/:id', verifyRole('admin', 'faculty'), ctrl.update);
router.delete('/:id', verifyRole('admin', 'faculty'), ctrl.remove);

module.exports = router;
