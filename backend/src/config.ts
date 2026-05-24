import path from 'path';

export const config = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  jwtSecret: process.env['JWT_SECRET'] ?? 'change-this-secret-in-production-min-32-chars!!',
  jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',

  uploadDir: path.resolve(process.env['UPLOAD_DIR'] ?? './uploads'),
  maxFileSize: parseInt(process.env['MAX_FILE_SIZE'] ?? '10485760', 10), // 10 MB

  smtp: {
    host: process.env['SMTP_HOST'] ?? '',
    port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    secure: process.env['SMTP_SECURE'] === 'true',
    user: process.env['SMTP_USER'] ?? '',
    pass: process.env['SMTP_PASS'] ?? '',
    from: process.env['SMTP_FROM'] ?? 'noreply@healthclaims.com',
  },

  get isProduction() {
    return this.nodeEnv === 'production';
  },

  get isDevelopment() {
    return this.nodeEnv === 'development';
  },

  sla: {
    adjudicationDays: parseInt(process.env['SLA_ADJUDICATION_DAYS'] ?? '30', 10),
    ackDays: parseInt(process.env['SLA_ACK_DAYS'] ?? '10', 10),
    warningWindowDays: parseInt(process.env['SLA_WARNING_WINDOW_DAYS'] ?? '3', 10),
  },
};
