import { withTransaction } from '../utils/dbTransaction.js';
import {
  getInventoryAdjustmentsService,
  getInventoryAdjustmentByIdService,
  createInventoryAdjustmentService,
  approveInventoryAdjustmentService,
  rejectInventoryAdjustmentService,
  postInventoryAdjustmentService,
} from '../services/inventoryAdjustmentService.js';

export const getInventoryAdjustments = async (req, res) => {
  try {
    const rows = await getInventoryAdjustmentsService(req.query);
    res.json(rows);
  } catch (error) {
    console.error('Get inventory adjustments error:', error);
    res.status(500).json({ message: 'Failed to fetch inventory adjustments' });
  }
};

export const getInventoryAdjustmentById = async (req, res) => {
  try {
    const row = await getInventoryAdjustmentByIdService(Number(req.params.id));

    if (!row) {
      return res.status(404).json({ message: 'Inventory adjustment not found' });
    }

    res.json(row);
  } catch (error) {
    console.error('Get inventory adjustment by id error:', error);
    res.status(500).json({ message: 'Failed to fetch inventory adjustment' });
  }
};

export const createInventoryAdjustment = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return createInventoryAdjustmentService(connection, req.body, req.user?.id);
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create inventory adjustment error:', error);
    res.status(400).json({ message: error.message || 'Failed to create inventory adjustment' });
  }
};

export const approveInventoryAdjustment = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return approveInventoryAdjustmentService(connection, Number(req.params.id), req.user?.id);
    });

    res.json(result);
  } catch (error) {
    console.error('Approve inventory adjustment error:', error);
    res.status(400).json({ message: error.message || 'Failed to approve inventory adjustment' });
  }
};

export const rejectInventoryAdjustment = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return rejectInventoryAdjustmentService(
        connection,
        Number(req.params.id),
        req.user?.id,
        req.body?.rejection_reason || null
      );
    });

    res.json(result);
  } catch (error) {
    console.error('Reject inventory adjustment error:', error);
    res.status(400).json({ message: error.message || 'Failed to reject inventory adjustment' });
  }
};

export const postInventoryAdjustment = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return postInventoryAdjustmentService(connection, Number(req.params.id), req.user?.id);
    });

    res.json(result);
  } catch (error) {
    console.error('Post inventory adjustment error:', error);
    res.status(400).json({ message: error.message || 'Failed to post inventory adjustment' });
  }
};