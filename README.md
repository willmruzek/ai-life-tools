# AI Tools for Life

Monorepo for small, personal AI-powered tools and automations.

## Apps

### YNAB

Located in `apps/ynab`.

- `categorize`
  - Fetches unapproved transactions from active checking, savings, cash, and credit-card accounts.
  - Uses OpenAI plus the current YNAB category list to categorize transactions.
  - Optionally uses Amazon order history from `apps/ynab/input/AmazonOrderHistory.csv` for better Amazon matches.
  - Writes results to `apps/ynab/output/categorize/categorizations-<timestamp>.json`.
  - Applies successful AI category assignments back to YNAB.
- `recommend`
  - Reviews the last 3 months of transactions and suggests category-structure changes.
  - Writes results to `apps/ynab/output/recommend/recommendations-<timestamp>.json`.
  - Read-only with respect to YNAB data.

See `apps/ynab/src/README.md` for detailed setup and usage.

### Bloomington Animal Shelter

Located in `apps/btownAnimalShelter`.

- Starts Firecrawl agent jobs to scrape Bloomington Animal Shelter cat listings.
- Extracts structured cat profile data, profile URLs, and image URLs.
- Tracks scrape job state, polls for completed jobs, and sends the final cat digest email through Postmark.
- Contains scripts for `createJob`, `checkJobs`, and `sendEmail` so the flow can be run manually outside cron.

### Organize Email

Located in `apps/organizeEmail`.

- Coming soon.
- Reserved for email organization and cleanup workflows.

## Commands

From the repository root:

```sh
pnpm install
pnpm lint
pnpm tsc
pnpm test
```

YNAB commands from the repository root:

```sh
pnpm --filter ynab ynab categorize
pnpm --filter ynab ynab recommend
```

YNAB commands from `apps/ynab`:

```sh
pnpm ynab categorize
pnpm ynab recommend
```

Bloomington Animal Shelter commands from the repository root:

```sh
pnpm --filter btown-animal-shelter build
pnpm --filter btown-animal-shelter trigger:createJob
pnpm --filter btown-animal-shelter trigger:checkJobs
pnpm --filter btown-animal-shelter trigger:sendEmail
```

## Requirements

- Node.js >= 24
- pnpm workspace support
