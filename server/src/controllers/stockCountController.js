import { withTransaction } from '../utils/dbTransaction.js';
import { requireDataScope } from '../middleware/dataScopeMiddleware.js';
import {
  getStockCountMetaService,
  getStockCountsService,
  getStockCountByIdService,
  createStockCountService,
  submitStockCountService,
  approveStockCountService,
  postStockCountService,
  cancelStockCountService,
} from '../services/stockCountService.js';

export const getStockCountMeta = async (req, res) => {
  try {
    const data = await getStockCountMetaService(requireDataScope(req));
    res.json(data);
  } catch (error) {
    console.error('Get stock count meta error:', error);
    res.status(500).json({ message: 'Failed to fetch stock count meta' });
  }
};

export const getStockCounts = async (req, res) => {
  try {
    const rows = await getStockCountsService(req.query, requireDataScope(req));
    res.json(rows);
  } catch (error) {
    console.error('Get stock counts error:', error);
    res.status(500).json({ message: 'Failed to fetch stock counts' });
  }
};

export const getStockCountById = async (req, res) => {
  try {
    const row = await getStockCountByIdService(Number(req.params.id), requireDataScope(req));

    if (!row) {
      return res.status(404).json({ message: 'Stock count not found' });
    }

    res.json(row);
  } catch (error) {
    console.error('Get stock count by id error:', error);
    res.status(500).json({ message: 'Failed to fetch stock count' });
  }
};

export const createStockCount = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return createStockCountService(connection, req.body, req.user?.id, requireDataScope(req));
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create stock count error:', error);
    res.status(400).json({ message: error.message || 'Failed to create stock count' });
  }
};

export const submitStockCount = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return submitStockCountService(connection, Number(req.params.id), requireDataScope(req));
    });

    res.json(result);
  } catch (error) {
    console.error('Submit stock count error:', error);
    res.status(400).json({ message: error.message || 'Failed to submit stock count' });
  }
};

export const approveStockCount = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return approveStockCountService(connection, Number(req.params.id), req.user?.id, requireDataScope(req));
    });

    res.json(result);
  } catch (error) {
    console.error('Approve stock count error:', error);
    res.status(400).json({ message: error.message || 'Failed to approve stock count' });
  }
};

export const postStockCount = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return postStockCountService(connection, Number(req.params.id), req.user?.id, requireDataScope(req));
    });

    res.json(result);
  } catch (error) {
    console.error('Post stock count error:', error);
    res.status(400).json({ message: error.message || 'Failed to post stock count' });
  }
};

export const cancelStockCount = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return cancelStockCountService(
        connection,
        Number(req.params.id),
        req.user?.id,
        req.body?.cancellation_reason || null,
        requireDataScope(req)
      );
    });

    res.json(result);
  } catch (error) {
    console.error('Cancel stock count error:', error);
    res.status(400).json({ message: error.message || 'Failed to cancel stock count' });
  }
};