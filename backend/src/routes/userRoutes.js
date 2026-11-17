const express = require('express');
const ctrl = require('../controllers/userController');
const { verifyToken, verifyRole } = require('../middleware/auth');
const { validateIdParam } = require('../utils/helpers');

const router = express.Router();
router.param('id', validateIdParam);
router.use(verifyToken, verifyRole('admin'));

router.get('/', ctrl.list);
router.patch('/:id/status', ctrl.setActive);

module.exports = router;
