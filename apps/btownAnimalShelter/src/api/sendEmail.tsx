import type { VercelRequest, VercelResponse } from '@vercel/node';
import { render } from '@react-email/components';
import { ServerClient as PostmarkServerClient } from 'postmark';
import { env } from '../env.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db } from '../db.ts';
import { catSchema } from '../agentConfig.ts';
import { CatListingEmail } from '../email/CatListingEmail.tsx';
import { requireBearerAuth } from '../auth.ts';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const auth = requireBearerAuth(req);
  if (!auth.ok) {
    res.status(auth.statusCode).send(auth.message);
    return;
  }

  const body = req.body as unknown;

  if (
    typeof body !== 'object' ||
    body === null ||
    !('jobId' in body) ||
    typeof body.jobId !== 'string'
  ) {
    res.status(400).json({ error: 'Missing jobId in request body' });
    return;
  }

  const { jobId } = body;

  const jobs = await db.getJobs();
  if (!jobs.some((j) => j.id === jobId && j.status === 'readyToEmail')) {
    res.status(404).json({ error: `No readyToEmail job found with ID ${jobId}` });
    return;
  }

  const agentStatus = await firecrawl.getAgentStatus(jobId);
  if (agentStatus.status !== 'completed' || agentStatus.data === undefined) {
    res.status(422).json({ error: 'Agent data not available' });
    return;
  }

  const catData = catSchema.parse(agentStatus.data);

  const html = await render(<CatListingEmail data={catData} />);

  const postmark = new PostmarkServerClient(env.POSTMARK_API_TOKEN);
  await postmark.sendEmail({
    From: env.EMAIL_RECIPIENT,
    To: env.EMAIL_RECIPIENT,
    Subject: `🐱 ${catData.final_extraction_count} cats available at Bloomington Animal Shelter`,
    HtmlBody: html,
  });

  await db.saveJobs(
    jobs.map((j) =>
      j.id === jobId ? { ...j, status: 'emailSent' as const } : j,
    ),
  );

  res.status(200).json({ sent: true });
}
