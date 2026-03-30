import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import db from '../config/db.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    const passwordHash = await bcrypt.hash('Admin@123', 10);

    await db.query(
      `
      INSERT INTO users (full_name, email, role, status, password)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        role = VALUES(role),
        status = VALUES(status),
        password = VALUES(password)
      `,
      ['System Administrator', 'admin@inventorypro.local', 'Admin', 'Active', passwordHash]
    );

    console.log('Admin user seeded successfully.');
    console.log('Email: admin@inventorypro.local');
    console.log('Password: Admin@123');
  } catch (error) {
    console.error('Seed admin error:', error);
  } finally {
    await db.end();
  }
};

seedAdmin();