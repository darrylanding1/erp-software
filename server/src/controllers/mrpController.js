import { withTransaction } from '../utils/dbTransaction.js';
import {
  getMrpMetaService,
  getMrpPoliciesService,
  upsertMrpPolicyService,
  getMrpRecommendationsService,
  createMrpRunService,
  getMrpRunsService,
  getMrpRunByIdService,
} from '../services/mrpService.js';

export const getMrpMeta = async (_req, res) => {
  try {
    const data = await getMrpMetaService();
    res.json(data);
  } catch (error) {
    console.error('Get MRP meta error:', error);
    res.status(500).json({ message: 'Failed to load MRP meta' });
  }
};

export const getMrpPolicies = async (req, res) => {
  try {
    const data = await getMrpPoliciesService(req.query);
    res.json(data);
  } catch (error) {
    console.error('Get MRP policies error:', error);
    res.status(500).json({ message: 'Failed to load replenishment policies' });
  }
};

export const upsertMrpPolicy = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return upsertMrpPolicyService(connection, req.body, req.user?.id);
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Upsert MRP policy error:', error);
    res.status(400).json({
      message: error.message || 'Failed to save replenishment policy',
    });
  }
};

export const getMrpRecommendations = async (req, res) => {
  try {
    const data = await getMrpRecommendationsService(req.query);
    res.json(data);
  } catch (error) {
    console.error('Get MRP recommendations error:', error);
    res.status(500).json({ message: 'Failed to generate replenishment recommendations' });
  }
};

export const createMrpRun = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return createMrpRunService(connection, req.body, req.user?.id);
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create MRP run error:', error);
    res.status(400).json({ message: error.message || 'Failed to save MRP run' });
  }
};

export const getMrpRuns = async (req, res) => {
  try {
    const data = await getMrpRunsService(req.query);
    res.json(data);
  } catch (error) {
    console.error('Get MRP runs error:', error);
    res.status(500).json({ message: 'Failed to load MRP runs' });
  }
};

export const getMrpRunById = async (req, res) => {
  try {
    const data = await getMrpRunByIdService(Number(req.params.id));

    if (!data) {
      return res.status(404).json({ message: 'MRP run not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Get MRP run by id error:', error);
    res.status(500).json({ message: 'Failed to load MRP run details' });
  }
};