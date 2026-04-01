import express from 'express';
import { getInventoryLedger } from '../controllers/inventoryLedgerController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('inventory.ledger.view'), attachDataScope, getInventoryLedger);

export default router;
