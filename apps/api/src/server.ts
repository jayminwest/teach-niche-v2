import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { authRouter } from './auth/router';
import { paymentsRouter } from './payments/router';
import { videosRouter } from './videos/router';
import { lessonRouter } from './lessons/router';
import { errorHandler } from './shared/middleware/error-handler';
import { logger } from './shared/monitoring';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api', limiter);

app.use('/api/auth', authRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/videos', videosRouter);
app.use('/api/lessons', lessonRouter);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0'
  });
});

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`, {
    environment: process.env.NODE_ENV,
    port: PORT,
    host: '0.0.0.0'
  });
});

export default app;