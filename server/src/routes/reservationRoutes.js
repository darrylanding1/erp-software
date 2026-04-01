import express from 'express';
import {
  getReservationMeta,
  getReservations,
  createReservation,
  releaseReservation,
  issueReservation,
} from '../controllers/reservationController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('reservations.view'), attachDataScope, getReservationMeta);
router.get('/', authorizePermissions('reservations.view'), attachDataScope, getReservations);
router.post('/', authorizePermissions('reservations.manage'), attachDataScope, createReservation);
router.post(
  '/:id/release',
  authorizePermissions('reservations.manage'),
  attachDataScope,
  releaseReservation
);
router.post(
  '/:id/issue',
  authorizePermissions('reservations.manage'),
  attachDataScope,
  issueReservation
);

export default router;
