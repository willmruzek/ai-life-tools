import { env } from './env.ts';

type AuthResult = { ok: true } | { ok: false; response: Response };

export function requireBearerAuth(req: Request): AuthResult {
  if (req.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`) {
    return { ok: true };
  }
  return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
}
