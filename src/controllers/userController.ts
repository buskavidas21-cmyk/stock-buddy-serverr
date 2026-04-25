import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import bcrypt from 'bcryptjs';
import { isAuditRoleEligible } from '../config/auditAccess';

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({ isActive: true })
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
    if (!['admin', 'staff', 'audits'].includes(normalizedRole)) {
      return res.status(400).json({ error: 'Invalid role' });
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
      isAuditApproved: approved
    });

    await user.save();

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { name, role, isActive, isAuditApproved } = req.body;
    const update: Record<string, unknown> = {};
    if (name !== undefined) {
      update.name = name;
    }
    if (isActive !== undefined) {
      update.isActive = isActive;
    }
    if (isAuditApproved !== undefined) {
      update.isAuditApproved = Boolean(isAuditApproved);
    }
    if (role !== undefined) {
      const normalizedRole = String(role).trim().toLowerCase();
      if (!['admin', 'staff', 'audits'].includes(normalizedRole)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      const existing = await User.findById(req.params.id).select('_id isAuditApproved');
      if (!existing) {
        return res.status(404).json({ error: 'User not found' });
      }
      const approved =
        isAuditApproved !== undefined ? Boolean(isAuditApproved) : Boolean(existing.isAuditApproved);
      if (normalizedRole === 'audits' && !isAuditRoleEligible({ isAuditApproved: approved })) {
        return res.status(400).json({ error: 'This account is not eligible for audits role' });
      }
      update.role = normalizedRole;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    ).select('-password -resetToken -resetTokenExpiry');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const resetUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { newPassword } = req.body;
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true }
    ).select('-password -resetToken -resetTokenExpiry');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
};