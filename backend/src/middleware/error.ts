import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err);

  // Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const fields = (err.meta?.['target'] as string[])?.join(', ') ?? 'field';
        res.status(409).json({ error: `Conflict: ${fields} already exists` });
        return;
      }
      case 'P2025':
        res.status(404).json({ error: 'Resource not found' });
        return;
      case 'P2003':
        res.status(400).json({ error: 'Related resource not found' });
        return;
      case 'P2014':
        res.status(400).json({ error: 'Invalid relation' });
        return;
      default:
        res.status(400).json({ error: `Database error: ${err.code}` });
        return;
    }
  }

  // Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Invalid data provided' });
    return;
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // JWT errors
  if (err instanceof TokenExpiredError) {
    res.status(401).json({ error: 'Token expired' });
    return;
  }
  if (err instanceof JsonWebTokenError) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Custom application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  // Generic errors
  if (err instanceof Error) {
    const statusCode = (err as AppError).statusCode ?? 500;
    const message =
      process.env['NODE_ENV'] === 'production' && statusCode === 500
        ? 'Internal server error'
        : err.message;
    res.status(statusCode).json({ error: message });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
