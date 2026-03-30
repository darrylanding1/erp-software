import express from 'express';
import {
  getPurchaseRequisitionMeta,
  getPurchaseRequisitions,
  getPurchaseRequisitionById,
  createPurchaseRequisitionFromMrpRun,
  submitPurchaseRequisition,
  approvePurchaseRequisition,
  convertPurchaseRequisitionToPo,
} from '../controllers/purchaseRequisitionController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('purchase_requisitions.view'), getPurchaseRequisitionMeta);
router.get('/', authorizePermissions('purchase_requisitions.view'), getPurchaseRequisitions);
router.get('/:id', authorizePermissions('purchase_requisitions.view'), getPurchaseRequisitionById);

router.post(
  '/from-mrp-run/:runId',
  authorizePermissions('purchase_requisitions.create'),
  createPurchaseRequisitionFromMrpRun
);

router.post(
  '/:id/submit',
  authorizePermissions('purchase_requisitions.create'),
  submitPurchaseRequisition
);

router.post(
  '/:id/approve',
  authorizePermissions('purchase_requisitions.approve'),
  approvePurchaseRequisition
);

router.post(
  '/:id/convert-to-po',
  authorizePermissions('purchase_requisitions.approve', 'purchases.create'),
  convertPurchaseRequisitionToPo
);

export default router;