import { agentPrompt, catSchema } from '../agentConfig.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db } from '../db.ts';
import { requireBearerAuth } from '../auth.ts';

async function createJob(): Promise<Response> {
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
    return Response.json(
      { error: `Failed to start agent: ${agentResult.error}` },
      { status: 500 },
    );
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

  return Response.json({ jobId: agentResult.id });
}

// Triggered by Vercel cron or manually (GET with Authorization: Bearer CRON_SECRET)
export default async function handler(req: Request): Promise<Response> {
  const auth = requireBearerAuth(req);

  if (!auth.ok) return auth.response;

  return createJob();
}
