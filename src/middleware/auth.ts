import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { isAuditRoleEligible } from '../config/auditAccess';

export interface AuthRequest extends Request {
  user?: IUser;
}

const isAdminRole = (role?: string) => role === 'admin' || role === 'super_admin';

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { userId: string };
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    if (user.role === 'audits' && !isAuditRoleEligible(user)) {
      return res.status(403).json({ error: 'This account is not authorized for the audits role.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

/** Staff, admin, or super_admin; blocks read-only audits role from mutating routes. */
export const requireStaffOrAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = req.user?.role;
  if (role === 'audits' || !role) {
    return res.status(403).json({ error: 'Write access denied' });
  }
  if (role !== 'admin' && role !== 'staff' && role !== 'super_admin') {
    return res.status(403).json({ error: 'Write access denied' });
  }
  next();
};
