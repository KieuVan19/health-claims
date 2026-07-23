import winston from 'winston';
import LokiTransport from 'winston-loki';
import { config } from '../config';

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }),
];

if (config.grafana.lokiUrl && config.grafana.lokiUser && config.grafana.lokiPassword) {
  transports.push(
    new LokiTransport({
      host: config.grafana.lokiUrl,
      basicAuth: `${config.grafana.lokiUser}:${config.grafana.lokiPassword}`,
      labels: { app: 'health-claims', env: config.nodeEnv },
      json: true,
      format: winston.format.json(),
      replaceTimestamp: true,
      onConnectionError: (err: unknown) => console.error('[Loki] Connection error:', err),
    })
  );
}

export const logger = winston.createLogger({
  level: 'info',
  transports,
});
