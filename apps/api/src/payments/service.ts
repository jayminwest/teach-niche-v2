import Stripe from 'stripe';
import { AppError } from '../shared/middleware/error-handler';
import { logger } from '../shared/monitoring';

export class PaymentService {
  private stripe: Stripe;
  
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-12-18.acacia'
    });
  }
  
  async createCheckoutSession(lessonId: string, userId: string) {
    const platformFeePercent = 15;
    
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Kendama Lesson',
            metadata: {
              lessonId
            }
          },
          unit_amount: 1999
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/lessons/${lessonId}?purchase=success`,
      cancel_url: `${process.env.FRONTEND_URL}/lessons/${lessonId}`,
      metadata: {
        userId,
        lessonId
      },
      payment_intent_data: {
        application_fee_amount: Math.floor(1999 * platformFeePercent / 100),
        metadata: {
          userId,
          lessonId
        }
      }
    });
    
    return session;
  }
  
  async handleWebhook(body: any, signature: string) {
    let event: Stripe.Event;
    
    try {
      event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      throw new AppError(400, 'Invalid webhook signature');
    }
    
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleSuccessfulPayment(session);
        break;
        
      default:
        logger.info('payment.webhook.unhandled', { type: event.type });
    }
  }
  
  private async handleSuccessfulPayment(session: Stripe.Checkout.Session) {
    const { userId, lessonId } = session.metadata!;
    
    logger.info('payment.successful', {
      userId,
      lessonId,
      amount: session.amount_total,
      sessionId: session.id
    });
  }
}