// server/src/services/reversalService.js
import { withTransaction } from '../utils/dbTransaction.js';
import {
  getOrCreateInventoryStockRowForUpdate,
  calculateMovingAverageReceipt,
  updateInventoryStockSnapshot,
} from './inventoryCostingService.js';
import { getLedgerByReference, insertInventoryLedger } from './inventoryLedgerService.js';
import { createJournalEntry, getAccountByCode } from './journalPostingService.js';
import { ACCOUNT_CODES } from '../constants/accountCodes.js';

export const reverseSalesDelivery = async ({ salesDeliveryId, userId, reason }) => {
  return withTransaction(async (connection) => {
    const [[delivery]] = await connection.query(
      `
      SELECT *
      FROM sales_deliveries
      WHERE id = ?
      FOR UPDATE
      `,
      [salesDeliveryId]
    );

    if (!delivery) throw new Error('Sales Delivery not found');
    if (delivery.status !== 'Posted') throw new Error('Only Posted Sales Delivery can be reversed');

    const ledgerRows = await getLedgerByReference(connection, 'SalesDelivery', salesDeliveryId);

    if (!ledgerRows.length) {
      throw new Error('No inventory ledger found for this sales delivery');
    }

    let totalReverseValue = 0;

    for (const row of ledgerRows) {
      const stockRow = await getOrCreateInventoryStockRowForUpdate(
        connection,
        row.product_id,
        row.warehouse_id
      );

      const costing = calculateMovingAverageReceipt({
        currentQty: stockRow.quantity,
        currentValue: stockRow.total_value,
        receivedQty: row.quantity_out,
        receivedUnitCost: row.unit_cost,
      });

      totalReverseValue += Number(row.line_total || 0);

      await updateInventoryStockSnapshot(connection, stockRow.id, {
        quantity: costing.qtyAfter,
        unitCost: costing.avgAfter,
        totalValue: costing.valueAfter,
      });

      await insertInventoryLedger(connection, {
        posting_date: new Date().toISOString().slice(0, 10),
        reference_type: 'SalesDeliveryReversal',
        reference_id: salesDeliveryId,
        reference_line_id: row.reference_line_id,
        product_id: row.product_id,
        warehouse_id: row.warehouse_id,
        movement_type: 'REVERSAL',
        quantity_in: row.quantity_out,
        quantity_out: 0,
        unit_cost: row.unit_cost,
        line_total: row.line_total,
        qty_before: costing.qtyBefore,
        qty_after: costing.qtyAfter,
        value_before: costing.valueBefore,
        value_after: costing.valueAfter,
        avg_cost_before: costing.avgBefore,
        avg_cost_after: costing.avgAfter,
        is_reversal: 1,
        reversed_ledger_id: row.id,
        remarks: reason || 'Sales delivery reversal',
        created_by: userId,
      });

      await connection.query(
        `
        UPDATE products
        SET quantity = quantity + ?
        WHERE id = ?
        `,
        [row.quantity_out, row.product_id]
      );
    }

    const inventoryAccount = await getAccountByCode(connection, ACCOUNT_CODES.INVENTORY_ASSET);
    const cogsAccount = await getAccountByCode(connection, ACCOUNT_CODES.COST_OF_GOODS_SOLD);

    await createJournalEntry(connection, {
      entryDate: new Date().toISOString().slice(0, 10),
      referenceType: 'SalesDeliveryReversal',
      referenceId: salesDeliveryId,
      memo: `Reversal of sales delivery ${delivery.delivery_number}`,
      lines: [
        {
          account_id: inventoryAccount.id,
          account_code: inventoryAccount.account_code,
          account_name: inventoryAccount.account_name,
          description: 'Restore inventory',
          debit: totalReverseValue,
          credit: 0,
        },
        {
          account_id: cogsAccount.id,
          account_code: cogsAccount.account_code,
          account_name: cogsAccount.account_name,
          description: 'Reverse COGS',
          debit: 0,
          credit: totalReverseValue,
        },
      ],
    });

    await connection.query(
      `
      UPDATE sales_deliveries
      SET status = 'Cancelled',
          cancelled_at = NOW(),
          cancelled_by = ?,
          cancellation_reason = ?
      WHERE id = ?
      `,
      [userId, reason || null, salesDeliveryId]
    );

    return { message: 'Sales Delivery reversed successfully' };
  });
};