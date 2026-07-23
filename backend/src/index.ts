import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { config } from './config';
import { errorHandler } from './middleware/error';
import { swaggerSpec } from './swagger';
import { logger } from './utils/logger';
import { register, metricsMiddleware } from './utils/metrics';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import policiesRouter from './routes/policies';
import claimsRouter from './routes/claims';
import documentsRouter from './routes/documents';
import notificationsRouter from './routes/notifications';
import adminRouter from './routes/admin';
import payoutsRouter from './routes/payouts';
import reportsRouter from './routes/reports';
import providersRouter from './routes/providers';
import overpaymentsRouter from './routes/overpayments';
import featuresRouter from './routes/features';

// Ensure uploads directory exists
fs.mkdirSync(config.uploadDir, { recursive: true });

const app = express();

// Security
app.use(helmet());
app.use(
  cors({
    origin: config.isProduction ? process.env['FRONTEND_URL'] : '*',
    credentials: true,
  })
);

// Logging
app.use(morgan(config.isDevelopment ? 'dev' : 'combined'));

// Metrics
app.use(metricsMiddleware);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (production only — dev traffic from polling/HMR would trigger it constantly)
if (config.isProduction) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api', limiter);
}

// Static file serving for uploads
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/claims', claimsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/reports', reportsRouter);
app.use('/api/payouts', payoutsRouter);
app.use('/api/providers', providersRouter);
app.use('/api/overpayments', overpaymentsRouter);
app.use('/api/features', featuresRouter);

// Swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Prometheus metrics
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  logger.info(`[Server] Running on port ${config.port} in ${config.nodeEnv} mode`);
  logger.info(`[Server] API docs: http://localhost:${config.port}/api/docs`);
});

export default app;
