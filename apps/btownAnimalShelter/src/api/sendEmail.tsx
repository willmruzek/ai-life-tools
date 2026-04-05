import type { VercelRequest, VercelResponse } from '@vercel/node';
import { render } from '@react-email/components';
import { ServerClient as PostmarkServerClient } from 'postmark';
import { env } from '../env.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db, type Job } from '../db.ts';
import { catSchema } from '../agentConfig.ts';
import { CatListingEmail } from '../email/CatListingEmail.tsx';
import { requireBearerAuth } from '../auth.ts';

type SendEmailSummary = {
  processed: number;
  sent: number;
  failed: number;
};

function getRequestedJobId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('jobId' in body)) {
    return undefined;
  }

  const { jobId } = body;

  if (typeof jobId !== 'string') {
    throw new Error('Invalid jobId in request body');
  }

  return jobId;
}

async function sendEmailForJob(jobId: string): Promise<void> {
  console.log(`[sendEmail] fetching agent status for jobId=${jobId}`);

  const t0 = Date.now();
  const agentStatus = await firecrawl.getAgentStatus(jobId);

  console.log(
    `[sendEmail] agent status=${agentStatus.status} (${Date.now() - t0}ms)`,
  );

  if (agentStatus.status !== 'completed' || agentStatus.data === undefined) {
    throw new Error('Agent data not available');
  }

  const parseResult = catSchema.safeParse(agentStatus.data);
  if (!parseResult.success) {
    throw new Error('Invalid agent data structure');
  }

  const catData = parseResult.data;

  console.log(
    `[sendEmail] parsed ${catData.cats.length} cats, rendering email`,
  );

  const t1 = Date.now();
  const html = await render(<CatListingEmail data={catData} />);

  console.log(`[sendEmail] email rendered in ${Date.now() - t1}ms`);

  const postmark = new PostmarkServerClient(env.POSTMARK_API_TOKEN);

  console.log('[sendEmail] sending via postmark');

  const t2 = Date.now();
  await postmark.sendEmail({
    From: env.EMAIL_RECIPIENT,
    To: env.EMAIL_RECIPIENT,
    Subject: `🐱 ${catData.final_extraction_count} cats available at Bloomington Animal Shelter`,
    HtmlBody: html,
  });

  console.log(`[sendEmail] postmark send completed in ${Date.now() - t2}ms`);
}

async function processReadyJobs(
  jobs: Job[],
  requestedJobId?: string,
): Promise<SendEmailSummary> {
  const jobsToSend = requestedJobId
    ? jobs.filter(
        (job) => job.id === requestedJobId && job.status === 'readyToEmail',
      )
    : jobs.filter((job) => job.status === 'readyToEmail');

  if (requestedJobId && jobsToSend.length === 0) {
    throw new Error(`No readyToEmail job found with ID ${requestedJobId}`);
  }

  let sent = 0;
  let failed = 0;
  const sentJobIds = new Set<string>();

  for (const job of jobsToSend) {
    console.log(`[sendEmail] processing readyToEmail job ${job.id}`);

    try {
      await sendEmailForJob(job.id);
      sent++;
      sentJobIds.add(job.id);
    } catch (error) {
      failed++;
      console.error(
        `[sendEmail] failed to send job ${job.id}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (sentJobIds.size > 0) {
    await db.saveJobs(
      jobs.map((job) =>
        sentJobIds.has(job.id) ? { ...job, status: 'emailSent' as const } : job,
      ),
    );
  }

  return {
    processed: jobsToSend.length,
    sent,
    failed,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  console.log(`[sendEmail] ${req.method} received`);

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const auth = requireBearerAuth(req);
  if (!auth.ok) {
    console.warn(`[sendEmail] auth failed: ${auth.message}`);
    res.status(auth.statusCode).send(auth.message);
    return;
  }

  const body = req.body as unknown;
  let requestedJobId: string | undefined;

  try {
    requestedJobId = getRequestedJobId(body);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  console.log(
    requestedJobId
      ? `[sendEmail] fetching jobs for jobId=${requestedJobId}`
      : '[sendEmail] fetching all readyToEmail jobs',
  );

  const t0 = Date.now();
  const jobs = await db.getJobs();

  console.log(`[sendEmail] got ${jobs.length} jobs (${Date.now() - t0}ms)`);

  try {
    const summary = await processReadyJobs(jobs, requestedJobId);

    if (requestedJobId && summary.processed === 0) {
      res
        .status(404)
        .json({ error: `No readyToEmail job found with ID ${requestedJobId}` });
      return;
    }

    console.log(
      `[sendEmail] done, processed=${summary.processed} sent=${summary.sent} failed=${summary.failed}`,
    );

    res.status(200).json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = requestedJobId ? 404 : 500;
    res.status(statusCode).json({ error: message });
  }
}
