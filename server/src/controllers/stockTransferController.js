import db from '../config/db.js';
import { withTransaction } from '../utils/dbTransaction.js';
import { requireDataScope } from '../middleware/dataScopeMiddleware.js';
import {
  createStockTransferService,
  approveStockTransferService,
  postStockTransferService,
  cancelStockTransferService,
  getStockTransfersService,
  getStockTransferByIdService,
} from '../services/stockTransferService.js';

export const getStockTransfers = async (req, res) => {
  try {
    const rows = await getStockTransfersService(req.query, requireDataScope(req));
    res.json(rows);
  } catch (error) {
    console.error('Get stock transfers error:', error);
    res.status(500).json({ message: 'Failed to fetch stock transfers' });
  }
};

export const getStockTransferById = async (req, res) => {
  try {
    const row = await getStockTransferByIdService(Number(req.params.id), requireDataScope(req));

    if (!row) {
      return res.status(404).json({ message: 'Stock transfer not found' });
    }

    res.json(row);
  } catch (error) {
    console.error('Get stock transfer by id error:', error);
    res.status(500).json({ message: 'Failed to fetch stock transfer' });
  }
};

export const createStockTransfer = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return createStockTransferService(connection, req.body, req.user?.id, requireDataScope(req));
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create stock transfer error:', error);
    res.status(400).json({ message: error.message || 'Failed to create stock transfer' });
  }
};

export const approveStockTransfer = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return approveStockTransferService(connection, Number(req.params.id), req.user?.id, requireDataScope(req));
    });

    res.json(result);
  } catch (error) {
    console.error('Approve stock transfer error:', error);
    res.status(400).json({ message: error.message || 'Failed to approve stock transfer' });
  }
};

export const postTransfer = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return postStockTransferService(connection, Number(req.params.id), req.user?.id, requireDataScope(req));
    });

    res.json(result);
  } catch (error) {
    console.error('Post stock transfer error:', error);
    res.status(400).json({ message: error.message || 'Failed to post stock transfer' });
  }
};

export const cancelStockTransfer = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return cancelStockTransferService(
        connection,
        Number(req.params.id),
        req.user?.id,
        req.body?.cancellation_reason || null,
        requireDataScope(req)
      );
    });

    res.json(result);
  } catch (error) {
    console.error('Cancel stock transfer error:', error);
    res.status(400).json({ message: error.message || 'Failed to cancel stock transfer' });
  }
};