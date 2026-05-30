import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const firstNameSchema = z.string().min(1, 'First name is required').max(100);

export const lastNameSchema = z.string().min(1, 'Last name is required').max(100);
