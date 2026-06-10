import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import bcrypt from 'bcryptjs';
import { isAuditRoleEligible } from '../config/auditAccess';

const ALLOWED_ROLES = ['super_admin', 'admin', 'staff', 'audits'] as const;

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive !== 'false';
    const filter = includeInactive ? {} : { isActive: true };

    const users = await User.find(filter)
      .select('-password -resetToken -resetTokenExpiry')
      .sort({ name: 1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role, isAuditApproved } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : 'staff';
    if (!ALLOWED_ROLES.includes(normalizedRole as (typeof ALLOWED_ROLES)[number])) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (normalizedRole === 'super_admin') {
      if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admin can create super admin users' });
      }
      const existingSuper = await User.findOne({ role: 'super_admin' });
      if (existingSuper) {
        return res.status(400).json({ error: 'A super admin already exists' });
      }
    }

    const approved = Boolean(isAuditApproved) || normalizedRole === 'audits';
    if (normalizedRole === 'audits' && !isAuditRoleEligible({ isAuditApproved: approved })) {
      return res.status(400).json({ error: 'This account is not eligible for audits role' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      email,
      password: hashedPassword,
      name,
      role: normalizedRole,
      isAuditApproved: approved,
    });

    await user.save();

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { name, role, isActive, isAuditApproved } = req.body;
    const target = await User.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can modify super admin accounts' });
    }

    const update: Record<string, unknown> = {};

    if (name !== undefined) {
      update.name = name;
    }

    if (isActive !== undefined) {
      if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admin can activate or deactivate users' });
      }
      if (target.role === 'super_admin' && isActive === false) {
        return res.status(403).json({ error: 'Super admin account cannot be deactivated' });
      }
      update.isActive = Boolean(isActive);
    }

    if (isAuditApproved !== undefined) {
      update.isAuditApproved = Boolean(isAuditApproved);
    }

    if (role !== undefined) {
      const normalizedRole = String(role).trim().toLowerCase();
      if (!ALLOWED_ROLES.includes(normalizedRole as (typeof ALLOWED_ROLES)[number])) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      if (normalizedRole === 'super_admin') {
        if (req.user?.role !== 'super_admin') {
          return res.status(403).json({ error: 'Only super admin can assign super admin role' });
        }
        const existingSuper = await User.findOne({
          role: 'super_admin',
          _id: { $ne: target._id },
        });
        if (existingSuper) {
          return res.status(400).json({ error: 'A super admin already exists' });
        }
      }

      const approved =
        isAuditApproved !== undefined ? Boolean(isAuditApproved) : Boolean(target.isAuditApproved);
      if (normalizedRole === 'audits' && !isAuditRoleEligible({ isAuditApproved: approved })) {
        return res.status(400).json({ error: 'This account is not eligible for audits role' });
      }

      update.role = normalizedRole;
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select(
      '-password -resetToken -resetTokenExpiry'
    );

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const resetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { newPassword } = req.body;

    const target = await User.findById(req.params.id).select('role');
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can reset super admin password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true }
    ).select('-password -resetToken -resetTokenExpiry');

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
};
