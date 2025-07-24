import { Router } from 'express';
import { requireAuth, AuthRequest } from '../auth/middleware';
import { PaymentService } from './service';
import { logger } from '../shared/monitoring';

export const paymentsRouter = Router();
const paymentService = new PaymentService();

paymentsRouter.post('/checkout', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { lessonId } = req.body;
    const userId = req.user!.uid;
    
    const session = await paymentService.createCheckoutSession(lessonId, userId);
    
    logger.info('payment.checkout.created', {
      userId,
      lessonId,
      sessionId: session.id
    });
    
    res.json({ sessionUrl: session.url });
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post('/webhook', async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    await paymentService.handleWebhook(req.body, sig);
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});