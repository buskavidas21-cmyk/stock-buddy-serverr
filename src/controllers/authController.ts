import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { sendPasswordResetEmail } from '../utils/emailService';
import { isAuditRoleEligible } from '../config/auditAccess';

const normalizeRoleForCreate = (role: unknown, user: { _id: unknown; email?: string }) => {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (!normalized) {
    return 'staff';
  }
  if (normalized === 'audits') {
    if (!isAuditRoleEligible({ _id: user._id as any, email: user.email || '' })) {
      throw new Error('This account is not eligible for audits role');
    }
    return 'audits';
  }
  if (normalized === 'admin' || normalized === 'staff') {
    return normalized;
  }
  throw new Error('Invalid role');
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, noti } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const resolvedRole = normalizeRoleForCreate(role, { _id: email, email });
    const user = new User({
      email,
      password: hashedPassword,
      name,
      role: resolvedRole,
      ...(noti !== undefined && { noti })
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error: any) {
    if (error?.message === 'Invalid role' || error?.message === 'This account is not eligible for audits role') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, noti } = req.body;

    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    if (noti !== undefined) {
      user.noti = noti;
    }
    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 12);

    user.resetToken = hashedOtp;
    user.resetTokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    await sendPasswordResetEmail(user.email, otp, user.name);
    res.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email, resetTokenExpiry: { $gt: new Date() } });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    if (!user.resetToken) {
      return res.status(400).json({ error: 'OTP not generated for this user' });
    }

    const isValidOtp = await bcrypt.compare(otp, user.resetToken);
    if (!isValidOtp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ error: 'Password reset failed' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    res.json({
      user: {
        id: user?._id,
        email: user?.email,
        name: user?.name,
        role: user?.role,
        lastLogin: user?.lastLogin
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

export const verifyToken = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ valid: false, error: 'Token not provided' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { userId: string };
      const user = await User.findById(decoded.userId);
      
      if (!user || !user.isActive) {
        return res.status(401).json({ valid: false, error: 'Invalid or inactive user' });
      }

      res.json({ 
        valid: true, 
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      return res.status(401).json({ valid: false, error: 'Invalid or expired token' });
    }
  } catch (error) {
    res.status(500).json({ valid: false, error: 'Token verification failed' });
  }
};