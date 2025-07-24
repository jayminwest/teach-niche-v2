import { Router } from 'express';
import { AuthRequest, requireAuth } from './middleware';
import { logger } from '../shared/monitoring';

export const authRouter = Router();

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  logger.info('auth.me', { userId: req.user?.uid });
  
  res.json({
    uid: req.user?.uid,
    email: req.user?.email,
    role: req.user?.role || 'student'
  });
});

authRouter.post('/set-role', requireAuth, async (req: AuthRequest, res) => {
  const { role } = req.body;
  
  if (!['student', 'instructor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  logger.info('auth.setRole', { 
    userId: req.user?.uid,
    role 
  });
  
  res.json({ message: 'Role updated successfully' });
});