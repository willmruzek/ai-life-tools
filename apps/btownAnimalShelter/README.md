# Bloomington Animal Shelter

This app scrapes the Bloomington Animal Shelter cat listings and emails a formated digest of available cats from the scraped data. It emails a formatted digest of available cats from the scraped data.

It is designed for Vercel deployment and uses three API handlers:

- `createJob` starts a Firecrawl agent run
- `checkJobs` polls pending Firecrawl jobs and triggers email delivery when jobs have finished
- `sendEmail` renders and sends the digest email through Postmark

## What It Does

- Scrapes `https://bloomington.in.gov/animal-shelter` with Firecrawl
- Extracts cat profile URLs, foster status, ages, and image
  URLs
- Sends an email with React Email and Postmark

## Workflow

1. `POST /api/createJob`

   Starts a Firecrawl agent with the prompt and schema defined in
   `src/agentConfig.ts`, then stores the returned job ID in blob storage with
   status `pending`.

2. `POST /api/checkJobs`

   Loads saved jobs, polls Firecrawl for pending jobs, persists completed jobs
   as `readyToEmail`, and then makes a `POST /api/sendEmail` call notifying so that `sendEmail` job to process the `readyToEmail` queue.

3. `POST /api/sendEmail`

   Fetches the completed Firecrawl result, validates it, renders the cat digest
   email, and sends it to `EMAIL_RECIPIENT` through Postmark.

## Environment Variables

The deployed API handlers require these variables:

| Variable                | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `FIRECRAWL_API_KEY`     | Authenticates requests to Firecrawl         |
| `BLOB_READ_WRITE_TOKEN` | Reads and writes job state in Vercel Blob   |
| `POSTMARK_API_TOKEN`    | Sends the final digest email                |
| `CRON_SECRET`           | Protects the API endpoints with bearer auth |
| `EMAIL_RECIPIENT`       | Recipient address for the digest email      |

The manual trigger scripts also require:

| Variable      | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `VERCEL_URL`  | Deployment hostname, for example `my-app.vercel.app` |
| `CRON_SECRET` | Same bearer token used by the API handlers           |

`VERCEL_URL` should be a hostname only. The trigger scripts prepend
`https://` themselves.

## Commands

From `apps/btownAnimalShelter`:

```sh
pnpm install
pnpm build
pnpm trigger:createJob
pnpm trigger:checkJobs
pnpm trigger:sendEmail
pnpm trigger:sendEmail <jobId>
```

From the repository root:

```sh
pnpm --filter btown-animal-shelter build
pnpm --filter btown-animal-shelter trigger:createJob
pnpm --filter btown-animal-shelter trigger:checkJobs
pnpm --filter btown-animal-shelter trigger:sendEmail
pnpm --filter btown-animal-shelter trigger:sendEmail <jobId>
```
