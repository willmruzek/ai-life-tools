import type { VercelRequest, VercelResponse } from '@vercel/node';
import { agentPrompt, catSchema } from '../agentConfig.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db } from '../db.ts';
import { requireBearerAuth } from '../auth.ts';

async function createJob(res: VercelResponse): Promise<void> {
  console.log('[createJob] starting firecrawl agent');
  const t0 = Date.now();
  const agentResult = await firecrawl.startAgent({
    prompt: agentPrompt,
    schema: catSchema,
    model: 'spark-1-mini',
  });
  console.log(`[createJob] startAgent finished in ${Date.now() - t0}ms`);

  if (!agentResult.success) {
    console.error('[createJob] startAgent failed:', agentResult.error);
    res.status(500).json({ error: `Failed to start agent: ${agentResult.error}` });
    return;
  }

  console.log('[createJob] fetching existing jobs from blob');
  const t1 = Date.now();
  const jobs = await db.getJobs();
  console.log(
    `[createJob] getJobs finished in ${Date.now() - t1}ms, found ${jobs.length} jobs`,
  );

  console.log('[createJob] saving jobs to blob');
  const t2 = Date.now();
  await db.saveJobs([
    ...jobs,
    {
      id: agentResult.id,
      startedAt: new Date().toISOString(),
      status: 'pending',
    },
  ]);
  console.log(`[createJob] saveJobs finished in ${Date.now() - t2}ms`);

  res.status(200).json({ jobId: agentResult.id });
}

// Triggered by Vercel cron or manually (GET with Authorization: Bearer CRON_SECRET)
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = requireBearerAuth(req);
  if (!auth.ok) {
    res.status(auth.statusCode).send(auth.message);
    return;
  }

  await createJob(res);
}
