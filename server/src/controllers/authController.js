import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import { getUserWithPermissions } from '../services/permissionService.js';

const buildToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '12h',
    }
  );

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const [rows] = await db.query(
      `
      SELECT id, full_name, email, role, status, password, created_at
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    const user = rows[0];

    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'Your account is inactive' });
    }

    const fullUser = await getUserWithPermissions(user.id);
    const token = buildToken(fullUser);

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN',
      moduleName: 'Authentication',
      recordId: user.id,
      description: `${user.full_name} logged in`,
      newValues: {
        email: user.email,
        role: fullUser.role,
        role_code: fullUser.role_code,
        permissions: fullUser.permissions,
        permission_overrides: fullUser.permission_overrides,
      },
      ipAddress: getRequestIp(req),
    });

    res.json({ token, user: fullUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Failed to log in' });
  }
};

export const getMe = async (req, res) => {
  res.json(req.user);
};