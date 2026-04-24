import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Audits users may only use transaction read APIs (enforced on those routes).
 * Block every other authenticated inventory/dashboard endpoint.
 */
export const rejectAuditsFromInventoryRoutes = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role === 'audits') {
    return res.status(403).json({ error: 'Audit users can only access the transactions module (read-only).' });
  }
  next();
};
