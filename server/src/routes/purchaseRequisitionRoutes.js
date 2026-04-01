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
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/meta',
  authorizePermissions('purchase_requisitions.view'),
  attachDataScope,
  getPurchaseRequisitionMeta
);
router.get(
  '/',
  authorizePermissions('purchase_requisitions.view'),
  attachDataScope,
  getPurchaseRequisitions
);
router.get(
  '/:id',
  authorizePermissions('purchase_requisitions.view'),
  attachDataScope,
  getPurchaseRequisitionById
);

router.post(
  '/from-mrp-run/:runId',
  authorizePermissions('purchase_requisitions.create'),
  attachDataScope,
  createPurchaseRequisitionFromMrpRun
);

router.post(
  '/:id/submit',
  authorizePermissions('purchase_requisitions.create'),
  attachDataScope,
  submitPurchaseRequisition
);

router.post(
  '/:id/approve',
  authorizePermissions('purchase_requisitions.approve'),
  attachDataScope,
  approvePurchaseRequisition
);

router.post(
  '/:id/convert-to-po',
  authorizePermissions('purchase_requisitions.approve', 'purchases.create'),
  attachDataScope,
  convertPurchaseRequisitionToPo
);

export default router;
