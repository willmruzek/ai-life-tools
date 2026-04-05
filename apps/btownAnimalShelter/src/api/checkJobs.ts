import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../env.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db, type Job } from '../db.ts';
import { requireBearerAuth } from '../auth.ts';

type ProcessResult =
  | { ok: true; updatedJobs: Job[]; updated: number; failed: number }
  | { ok: false; error: string };

async function processPendingJobs(jobs: Job[]): Promise<ProcessResult> {
  let updated = 0;
  let failed = 0;
  try {
    const updatedJobs = await Promise.all(
      jobs.map(async (job) => {
        if (job.status !== 'pending') return job;

        console.log(`[checkJobs] polling agent status for job ${job.id}`);
        const t0 = Date.now();
        const status = await firecrawl.getAgentStatus(job.id);
        console.log(
          `[checkJobs] job ${job.id} status=${status.status} (${Date.now() - t0}ms)`,
        );

        if (status.status === 'completed') {
          updated++;
          return { ...job, status: 'readyToEmail' as const };
        } else if (status.status === 'failed') {
          failed++;
          console.error(
            `[checkJobs] agent job ${job.id} failed: ${status.error}`,
          );
          return { ...job, status: 'failed' as const };
        }

        return job;
      }),
    );
    return { ok: true, updatedJobs, updated, failed };
  } catch (err) {
    console.error('[checkJobs] processPendingJobs threw:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function sendReadyEmails(jobs: Job[], baseUrl: string): Promise<number> {
  const readyJobs = jobs.filter((job) => job.status === 'readyToEmail');

  if (readyJobs.length === 0) {
    return 0;
  }

  console.log(
    `[checkJobs] notifying sendEmail to drain ${readyJobs.length} ready job(s)`,
  );

  const t0 = Date.now();
  const emailRes = await fetch(`${baseUrl}/api/sendEmail`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CRON_SECRET}`,
    },
    body: JSON.stringify({}),
  });

  const text = await emailRes.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    payload = text;
  }

  console.log(
    `[checkJobs] sendEmail responded ${emailRes.status} in ${Date.now() - t0}ms`,
    payload,
  );

  if (!emailRes.ok) {
    throw new Error(
      `sendEmail failed with ${emailRes.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
    );
  }

  if (
    typeof payload === 'object' &&
    payload !== null &&
    'sent' in payload &&
    typeof payload.sent === 'number'
  ) {
    return payload.sent;
  }

  return 0;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const auth = requireBearerAuth(req);
  if (!auth.ok) {
    res.status(auth.statusCode).send(auth.message);
    return;
  }

  const proto = Array.isArray(req.headers['x-forwarded-proto'])
    ? req.headers['x-forwarded-proto'][0]
    : (req.headers['x-forwarded-proto'] ?? 'https');
  const host = req.headers['host'] ?? 'localhost';
  const baseUrl = `${proto}://${host}`;

  console.log('[checkJobs] fetching jobs from db');
  const t0 = Date.now();
  const jobs = await db.getJobs();
  const pendingJobs = jobs.filter((j) => j.status === 'pending');
  const readyToEmailJobs = jobs.filter((j) => j.status === 'readyToEmail');
  console.log(
    `[checkJobs] found ${jobs.length} total jobs, ${pendingJobs.length} pending, ${readyToEmailJobs.length} readyToEmail (${Date.now() - t0}ms)`,
  );

  if (pendingJobs.length === 0 && readyToEmailJobs.length === 0) {
    res.status(200).json({ processed: 0, emailed: 0 });
    return;
  }

  const result = await processPendingJobs(jobs);
  if (!result.ok) {
    console.error('[checkJobs] processing failed:', result.error);
    res.status(500).json({ error: result.error });
    return;
  }
  console.log(
    `[checkJobs] saving jobs, updated=${result.updated} failed=${result.failed}`,
  );
  await db.saveJobs(result.updatedJobs);

  const emailed = await sendReadyEmails(result.updatedJobs, baseUrl);

  res.status(200).json({
    processed: pendingJobs.length,
    updated: result.updated,
    failed: result.failed,
    emailed,
  });
}
