import type { VercelRequest } from '@vercel/node';
import { env } from './env.ts';

type AuthResult =
  | { ok: true }
  | { ok: false; statusCode: number; message: string };

export function requireBearerAuth(req: VercelRequest): AuthResult {
  if (req.headers['authorization'] === `Bearer ${env.CRON_SECRET}`) {
    return { ok: true };
  }
  return { ok: false, statusCode: 401, message: 'Unauthorized' };
}
