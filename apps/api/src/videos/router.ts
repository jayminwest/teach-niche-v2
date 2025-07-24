import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth/middleware';
import { VideoService } from './service';
import { logger } from '../shared/monitoring';

export const videosRouter = Router();
const videoService = new VideoService();

videosRouter.get('/access/:lessonId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { lessonId } = req.params;
    const userId = req.user!.uid;
    
    const signedUrl = await videoService.generateSignedUrl(lessonId, userId);
    
    logger.info('video.access.granted', {
      userId,
      lessonId
    });
    
    res.json({ url: signedUrl });
  } catch (error) {
    next(error);
  }
});