import { withTransaction } from '../utils/dbTransaction.js';
import { requireDataScope } from '../middleware/dataScopeMiddleware.js';
import {
  getPurchaseRequisitionMetaService,
  getPurchaseRequisitionsService,
  getPurchaseRequisitionByIdService,
  createPurchaseRequisitionFromMrpRunService,
  submitPurchaseRequisitionService,
  approvePurchaseRequisitionService,
  convertPurchaseRequisitionToPoService,
} from '../services/purchaseRequisitionService.js';

export const getPurchaseRequisitionMeta = async (req, res) => {
  try {
    const data = await getPurchaseRequisitionMetaService(requireDataScope(req));
    res.json(data);
  } catch (error) {
    console.error('Get purchase requisition meta error:', error);
    res.status(500).json({ message: 'Failed to load purchase requisition metadata' });
  }
};

export const getPurchaseRequisitions = async (req, res) => {
  try {
    const data = await getPurchaseRequisitionsService(req.query, requireDataScope(req));
    res.json(data);
  } catch (error) {
    console.error('Get purchase requisitions error:', error);
    res.status(500).json({ message: 'Failed to load purchase requisitions' });
  }
};

export const getPurchaseRequisitionById = async (req, res) => {
  try {
    const data = await getPurchaseRequisitionByIdService(Number(req.params.id), requireDataScope(req));

    if (!data) {
      return res.status(404).json({ message: 'Purchase requisition not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Get purchase requisition by id error:', error);
    res.status(500).json({ message: 'Failed to load purchase requisition details' });
  }
};

export const createPurchaseRequisitionFromMrpRun = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) =>
      createPurchaseRequisitionFromMrpRunService(
        connection,
        Number(req.params.runId),
        req.body,
        req.user,
        req.ip,
        requireDataScope(req)
      )
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('Create PR from MRP run error:', error);
    res.status(400).json({ message: error.message || 'Failed to create purchase requisition' });
  }
};

export const submitPurchaseRequisition = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) =>
      submitPurchaseRequisitionService(
        connection,
        Number(req.params.id),
        req.user,
        req.ip,
        requireDataScope(req)
      )
    );

    res.json(result);
  } catch (error) {
    console.error('Submit purchase requisition error:', error);
    res.status(400).json({ message: error.message || 'Failed to submit purchase requisition' });
  }
};

export const approvePurchaseRequisition = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) =>
      approvePurchaseRequisitionService(
        connection,
        Number(req.params.id),
        req.user,
        req.ip,
        requireDataScope(req)
      )
    );

    res.json(result);
  } catch (error) {
    console.error('Approve purchase requisition error:', error);
    res.status(400).json({ message: error.message || 'Failed to approve purchase requisition' });
  }
};

export const convertPurchaseRequisitionToPo = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) =>
      convertPurchaseRequisitionToPoService(
        connection,
        Number(req.params.id),
        req.body,
        req.user,
        req.ip,
        requireDataScope(req)
      )
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('Convert purchase requisition to PO error:', error);
    res.status(400).json({ message: error.message || 'Failed to convert PR to purchase orders' });
  }
};