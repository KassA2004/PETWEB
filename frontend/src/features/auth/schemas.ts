import { z } from 'zod';

/**
 * Matches the field rules in /Docs/API-endpoints/02-user-endpoints.md §3 and
 * the backend's `emailAndPassword.minPasswordLength` (Backend/src/auth/auth.ts).
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(24, 'Username must be at most 24 characters.')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, "_" and "-" are allowed.');

// z.string().email() rather than the top-level z.email() so trimming happens
// before format validation (an email pasted with surrounding whitespace should
// still validate).
export const emailSchema = z.string().trim().email('Enter a valid email address.');

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters.');

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
