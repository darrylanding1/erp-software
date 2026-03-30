import express from 'express';
import {
  getUsers,
  getUsersMeta,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/userController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('users.view'), getUsers);
router.get('/meta', authorizePermissions('users.view'), getUsersMeta);
router.post('/', authorizePermissions('users.create'), createUser);
router.put('/:id', authorizePermissions('users.update'), updateUser);
router.delete('/:id', authorizePermissions('users.delete'), deleteUser);

export default router;