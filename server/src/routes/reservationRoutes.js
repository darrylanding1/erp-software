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

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('reservations.view'), getReservationMeta);
router.get('/', authorizePermissions('reservations.view'), getReservations);
router.post('/', authorizePermissions('reservations.manage'), createReservation);
router.post('/:id/release', authorizePermissions('reservations.manage'), releaseReservation);
router.post('/:id/issue', authorizePermissions('reservations.manage'), issueReservation);

export default router;