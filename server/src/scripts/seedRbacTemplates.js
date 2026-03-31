import dotenv from 'dotenv';
import db from '../config/db.js';

dotenv.config();

const roleTemplates = {
  admin: [
    'dashboard.view',
    'products.view', 'products.create', 'products.update', 'products.delete',
    'categories.view', 'categories.create', 'categories.update', 'categories.delete',
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count', 'inventory.ledger.view',
    'suppliers.view', 'suppliers.create', 'suppliers.update', 'suppliers.delete',
    'purchases.view', 'purchases.create', 'purchases.receive',
    'purchase_requisitions.view', 'purchase_requisitions.create', 'purchase_requisitions.approve',
    'goods_receipts.view', 'goods_receipts.create', 'goods_receipts.post',
    'sales.view', 'sales.create',
    'deliveries.view', 'deliveries.create',
    'sales_returns.view', 'sales_returns.create',
    'sales_orders.view', 'sales_orders.create', 'sales_orders.update',
    'customers.view', 'customers.create', 'customers.update', 'customers.delete',
    'customer_refunds.view', 'customer_refunds.create',
    'accounting.view', 'accounting.post',
    'financial_reports.view',
    'accounting_periods.view', 'accounting_periods.manage',
    'users.view', 'users.create', 'users.update', 'users.delete',
    'roles.manage',
    'audit_trails.view',
    'organization.view', 'organization.manage',
    'mrp.view', 'mrp.run',
    'reservations.view', 'reservations.manage',
  ],
  manager: [
    'dashboard.view',
    'products.view', 'products.create', 'products.update',
    'categories.view', 'categories.create', 'categories.update',
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count', 'inventory.ledger.view',
    'suppliers.view', 'suppliers.create', 'suppliers.update',
    'purchases.view', 'purchases.create', 'purchases.receive',
    'purchase_requisitions.view', 'purchase_requisitions.create', 'purchase_requisitions.approve',
    'goods_receipts.view', 'goods_receipts.create', 'goods_receipts.post',
    'sales.view', 'sales.create',
    'deliveries.view', 'deliveries.create',
    'sales_returns.view', 'sales_returns.create',
    'sales_orders.view', 'sales_orders.create', 'sales_orders.update',
    'customers.view', 'customers.create', 'customers.update',
    'customer_refunds.view', 'customer_refunds.create',
    'accounting.view', 'financial_reports.view',
    'accounting_periods.view',
    'users.view',
    'organization.view',
    'mrp.view', 'mrp.run',
    'reservations.view', 'reservations.manage',
  ],
  staff: [
    'dashboard.view',
    'products.view',
    'categories.view',
    'inventory.view',
    'suppliers.view',
    'purchases.view',
    'purchase_requisitions.view', 'purchase_requisitions.create',
    'goods_receipts.view',
    'sales.view', 'sales.create',
    'deliveries.view',
    'sales_returns.view',
    'sales_orders.view',
    'customers.view',
    'customer_refunds.view',
  ],
};

async function run() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [roles] = await connection.query(`
      SELECT id, code, name
      FROM roles
    `);

    const [permissions] = await connection.query(`
      SELECT id, code
      FROM permissions
    `);

    const roleIdByCode = Object.fromEntries(roles.map((row) => [row.code, row.id]));
    const permissionIdByCode = Object.fromEntries(
      permissions.map((row) => [row.code, row.id])
    );

    for (const [roleCode, permissionCodes] of Object.entries(roleTemplates)) {
      const roleId = roleIdByCode[roleCode];

      if (!roleId) {
        console.warn(`Skipping missing role: ${roleCode}`);
        continue;
      }

      await connection.query(
        `
        DELETE FROM role_permissions
        WHERE role_id = ?
        `,
        [roleId]
      );

      const validPermissionIds = permissionCodes
        .map((code) => permissionIdByCode[code])
        .filter(Boolean);

      const missingPermissionCodes = permissionCodes.filter(
        (code) => !permissionIdByCode[code]
      );

      if (missingPermissionCodes.length > 0) {
        console.warn(
          `Role "${roleCode}" skipped missing permission codes: ${missingPermissionCodes.join(', ')}`
        );
      }

      if (validPermissionIds.length > 0) {
        const values = validPermissionIds.map((permissionId) => [roleId, permissionId]);

        await connection.query(
          `
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES ?
          `,
          [values]
        );
      }

      console.log(`Seeded role "${roleCode}" with ${validPermissionIds.length} permissions`);
    }

    await connection.commit();
    console.log('RBAC templates seeded successfully.');
  } catch (error) {
    await connection.rollback();
    console.error('RBAC seed failed:', error);
    process.exitCode = 1;
  } finally {
    connection.release();
    process.exit();
  }
}

run();
