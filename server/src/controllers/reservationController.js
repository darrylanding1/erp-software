import { withTransaction } from '../utils/dbTransaction.js';
import {
  getReservationMetaService,
  getReservationsService,
  createReservationService,
  releaseReservationService,
  issueReservationService,
} from '../services/reservationService.js';

export const getReservationMeta = async (_req, res) => {
  try {
    const data = await getReservationMetaService();
    res.json(data);
  } catch (error) {
    console.error('Get reservation meta error:', error);
    res.status(500).json({ message: 'Failed to fetch reservation meta' });
  }
};

export const getReservations = async (req, res) => {
  try {
    const rows = await getReservationsService(req.query);
    res.json(rows);
  } catch (error) {
    console.error('Get reservations error:', error);
    res.status(500).json({ message: 'Failed to fetch reservations' });
  }
};

export const createReservation = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return createReservationService(connection, req.body, req.user?.id);
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create reservation error:', error);
    res.status(400).json({ message: error.message || 'Failed to create reservation' });
  }
};

export const releaseReservation = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return releaseReservationService(connection, Number(req.params.id));
    });

    res.json(result);
  } catch (error) {
    console.error('Release reservation error:', error);
    res.status(400).json({ message: error.message || 'Failed to release reservation' });
  }
};

export const issueReservation = async (req, res) => {
  try {
    const result = await withTransaction(async (connection) => {
      return issueReservationService(
        connection,
        Number(req.params.id),
        req.body?.issue_quantity,
        req.user?.id
      );
    });

    res.json(result);
  } catch (error) {
    console.error('Issue reservation error:', error);
    res.status(400).json({ message: error.message || 'Failed to issue reservation' });
  }
};