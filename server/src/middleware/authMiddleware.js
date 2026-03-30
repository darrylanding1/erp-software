import jwt from 'jsonwebtoken';
import { getUserWithPermissions } from '../services/permissionService.js';

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1];
};

const buildPermissionSet = (user) => new Set(user?.permissions || []);

export const authenticate = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getUserWithPermissions(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ message: 'User account is inactive' });
    }

    req.user = user;
    req.hasPermission = (permission) => buildPermissionSet(user).has(permission);
    req.hasAllPermissions = (permissions = []) =>
      permissions.every((permission) => buildPermissionSet(user).has(permission));
    req.hasAnyPermission = (permissions = []) =>
      permissions.some((permission) => buildPermissionSet(user).has(permission));

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (allowedRoles.length === 0) {
    return next();
  }

  const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [];
  const isAllowed =
    userRoles.some((role) => allowedRoles.includes(role)) ||
    allowedRoles.includes(req.user.role);

  if (!isAllowed) {
    return res.status(403).json({
      message: 'You do not have permission to access this resource',
    });
  }

  next();
};

export const authorizePermissions = (...requiredPermissions) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (requiredPermissions.length === 0) {
    return next();
  }

  const hasAll = req.hasAllPermissions(requiredPermissions);

  if (!hasAll) {
    return res.status(403).json({
      message: 'You do not have the required permission',
      required_permissions: requiredPermissions,
    });
  }

  next();
};

export const authorizeAnyPermission = (...requiredPermissions) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (requiredPermissions.length === 0) {
    return next();
  }

  const hasAny = req.hasAnyPermission(requiredPermissions);

  if (!hasAny) {
    return res.status(403).json({
      message: 'You do not have the required permission',
      required_permissions: requiredPermissions,
    });
  }

  next();
};