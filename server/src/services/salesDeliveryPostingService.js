import { withTransaction } from '../utils/dbTransaction.js';
import {
  getOrCreateInventoryStockRowForUpdate,
  calculateIssueAtAverage,
  updateInventoryStockSnapshot,
} from './inventoryCostingService.js';
import { insertInventoryLedger } from './inventoryLedgerService.js';
import {
  assertDocumentStatus,
  assertLinesExist,
  assertStockAvailable,
} from './postingValidationService.js';
import { postSalesDeliveryGL } from './glPostingEngine.js';

export const postSalesDelivery = async ({ salesDeliveryId, userId }) => {
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

    assertDocumentStatus(delivery, ['Draft'], 'Sales Delivery');

    const [lines] = await connection.query(
      `
      SELECT sdi.*, sd.delivery_date, sd.warehouse_id, p.name AS product_name
      FROM sales_delivery_items sdi
      INNER JOIN sales_deliveries sd ON sd.id = sdi.sales_delivery_id
      INNER JOIN products p ON p.id = sdi.product_id
      WHERE sdi.sales_delivery_id = ?
      `,
      [salesDeliveryId]
    );

    assertLinesExist(lines, 'Sales Delivery items');

    let totalCogs = 0;

    for (const line of lines) {
      const stockRow = await getOrCreateInventoryStockRowForUpdate(
        connection,
        line.product_id,
        delivery.warehouse_id
      );

      assertStockAvailable(stockRow.quantity, line.delivered_quantity, line.product_name);

      const costing = calculateIssueAtAverage({
        currentQty: stockRow.quantity,
        currentValue: stockRow.total_value,
        issueQty: line.delivered_quantity,
      });

      totalCogs += Number(costing.issueValue || 0);

      await updateInventoryStockSnapshot(connection, stockRow.id, {
        quantity: costing.qtyAfter,
        unitCost: costing.avgAfter,
        totalValue: costing.valueAfter,
      });

      await insertInventoryLedger(connection, {
        posting_date: delivery.delivery_date,
        reference_type: 'SalesDelivery',
        reference_id: delivery.id,
        reference_line_id: line.id,
        product_id: line.product_id,
        warehouse_id: delivery.warehouse_id,
        movement_type: 'ISSUE',
        quantity_in: 0,
        quantity_out: line.delivered_quantity,
        unit_cost: costing.issueUnitCost,
        line_total: costing.issueValue,
        qty_before: costing.qtyBefore,
        qty_after: costing.qtyAfter,
        value_before: costing.valueBefore,
        value_after: costing.valueAfter,
        avg_cost_before: costing.avgBefore,
        avg_cost_after: costing.avgAfter,
        remarks: `Sales delivery ${delivery.delivery_number}`,
        created_by: userId,
      });

      await connection.query(
        `
        UPDATE products
        SET quantity = quantity - ?
        WHERE id = ?
        `,
        [line.delivered_quantity, line.product_id]
      );
    }

    await connection.query(
      `
      UPDATE sales_deliveries
      SET status = 'Posted'
      WHERE id = ?
      `,
      [salesDeliveryId]
    );

    await postSalesDeliveryGL({
      salesDeliveryId: delivery.id,
      totalCogs,
      connection,
    });

    return { message: 'Sales Delivery posted successfully' };
  });
};