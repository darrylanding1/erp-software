import {
  getBinMetaService,
  getBinsService,
  createBinService,
  updateBinService,
  updateBinStatusService,
} from '../services/binService.js';
import { requireDataScope } from '../middleware/dataScopeMiddleware.js';

export const getBinMeta = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const data = await getBinMetaService(scope);
    res.json(data);
  } catch (error) {
    console.error('Get bin meta error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch bin metadata' });
  }
};

export const getBins = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const rows = await getBinsService(req.query, scope);
    res.json(rows);
  } catch (error) {
    console.error('Get bins error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch bins' });
  }
};

export const createBin = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      warehouse_id,
      zone_id,
      bin_code,
      bin_name,
      bin_type,
      allow_mixed_products,
      allow_negative_stock,
      max_capacity_qty,
      sort_order,
    } = req.body;

    if (!warehouse_id || !bin_code) {
      return res.status(400).json({
        message: 'warehouse_id and bin_code are required',
      });
    }

    const id = await createBinService({
      warehouse_id,
      zone_id,
      bin_code,
      bin_name,
      bin_type,
      allow_mixed_products,
      allow_negative_stock,
      max_capacity_qty,
      sort_order,
    }, scope);

    res.status(201).json({
      message: 'Bin created successfully',
      id,
    });
  } catch (error) {
    console.error('Create bin error:', error);

    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        message: 'Bin code already exists for this warehouse',
      });
    }

    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create bin' });
  }
};

export const updateBin = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const affectedRows = await updateBinService(req.params.id, req.body, scope);

    if (!affectedRows) {
      return res.status(404).json({ message: 'Bin not found' });
    }

    res.json({ message: 'Bin updated successfully' });
  } catch (error) {
    console.error('Update bin error:', error);

    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        message: 'Bin code already exists for this warehouse',
      });
    }

    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update bin' });
  }
};

export const updateBinStatus = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { is_active } = req.body;

    const affectedRows = await updateBinStatusService(req.params.id, is_active, scope);

    if (!affectedRows) {
      return res.status(404).json({ message: 'Bin not found' });
    }

    res.json({ message: 'Bin status updated successfully' });
  } catch (error) {
    console.error('Update bin status error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update bin status' });
  }
};