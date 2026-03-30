import { withTransaction } from '../utils/dbTransaction.js';
import {
  getOrCreateInventoryStockRowForUpdate,
  calculateMovingAverageReceipt,
  updateInventoryStockSnapshot,
} from './inventoryCostingService.js';
import { insertInventoryLedger } from './inventoryLedgerService.js';
import { assertDocumentStatus, assertLinesExist } from './postingValidationService.js';

export const postGoodsReceipt = async ({ goodsReceiptId, userId }) => {
  return withTransaction(async (connection) => {
    const [[receipt]] = await connection.query(
      `
      SELECT *
      FROM goods_receipts
      WHERE id = ?
      FOR UPDATE
      `,
      [goodsReceiptId]
    );

    assertDocumentStatus(receipt, ['Draft'], 'Goods Receipt');

    const [lines] = await connection.query(
      `
      SELECT gri.*, gr.receipt_date, gr.warehouse_id, p.name AS product_name
      FROM goods_receipt_items gri
      INNER JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
      INNER JOIN products p ON p.id = gri.product_id
      WHERE gri.goods_receipt_id = ?
      `,
      [goodsReceiptId]
    );

    assertLinesExist(lines, 'Goods Receipt items');

    for (const line of lines) {
      const stockRow = await getOrCreateInventoryStockRowForUpdate(
        connection,
        line.product_id,
        receipt.warehouse_id
      );

      const costing = calculateMovingAverageReceipt({
        currentQty: stockRow.quantity,
        currentValue: stockRow.total_value,
        receivedQty: line.received_quantity,
        receivedUnitCost: line.unit_cost,
      });

      await updateInventoryStockSnapshot(connection, stockRow.id, {
        quantity: costing.qtyAfter,
        unitCost: costing.avgAfter,
        totalValue: costing.valueAfter,
      });

      await insertInventoryLedger(connection, {
        posting_date: receipt.receipt_date,
        reference_type: 'GoodsReceipt',
        reference_id: receipt.id,
        reference_line_id: line.id,
        product_id: line.product_id,
        warehouse_id: receipt.warehouse_id,
        movement_type: 'RECEIPT',
        quantity_in: line.received_quantity,
        quantity_out: 0,
        unit_cost: line.unit_cost,
        line_total: costing.receiptValue,
        qty_before: costing.qtyBefore,
        qty_after: costing.qtyAfter,
        value_before: costing.valueBefore,
        value_after: costing.valueAfter,
        avg_cost_before: costing.avgBefore,
        avg_cost_after: costing.avgAfter,
        remarks: `Goods receipt ${receipt.gr_number}`,
        created_by: userId,
      });

      await connection.query(
        `
        UPDATE purchase_order_items
        SET received_quantity = received_quantity + ?
        WHERE id = ?
        `,
        [line.received_quantity, line.purchase_order_item_id]
      );

      await connection.query(
        `
        UPDATE products
        SET quantity = quantity + ?
        WHERE id = ?
        `,
        [line.received_quantity, line.product_id]
      );
    }

    await connection.query(
      `
      UPDATE goods_receipts
      SET status = 'Posted',
          posted_at = NOW(),
          posted_by = ?
      WHERE id = ?
      `,
      [userId, goodsReceiptId]
    );

    return { message: 'Goods Receipt posted successfully' };
  });
};