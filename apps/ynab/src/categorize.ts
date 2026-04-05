import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import * as csv from 'csv-parse/sync';
import dedent from 'dedent';
import { encode } from 'gpt-tokenizer';
import * as ynab from 'ynab';
import { z } from 'zod';

import { env } from './env.ts';

const ACCOUNT_TYPES = new Set<ynab.AccountType>([
  ynab.AccountType.Checking,
  ynab.AccountType.Savings,
  ynab.AccountType.Cash,
  ynab.AccountType.CreditCard,
]);

const moduleDir = url.fileURLToPath(new URL('.', import.meta.url));
const appDir = path.join(moduleDir, '..');
const inputDir = path.join(appDir, 'input');
const outputDir = path.join(appDir, 'output');

export const main = async (): Promise<void> => {
  const { OPENAI_API_KEY, YNAB_ACCESS_TOKEN, YNAB_PLAN_ID } = env;

  const openai = createOpenAI({
    apiKey: OPENAI_API_KEY,
  });

  const ynabAPI = new ynab.API(YNAB_ACCESS_TOKEN);

  const [accountsResponse, categoriesResponse] = await Promise.all([
    ynabAPI.accounts.getAccounts(YNAB_PLAN_ID),
    ynabAPI.categories.getCategories(YNAB_PLAN_ID),
  ]);

  const targetAccounts = accountsResponse.data.accounts.filter(
    (a) => !a.deleted && !a.closed && ACCOUNT_TYPES.has(a.type),
  );

  console.log(`Processing ${targetAccounts.length} account(s):`);

  for (const account of targetAccounts) {
    console.log(`  • ${account.name}`);
  }

  const txResponses = await Promise.all(
    targetAccounts.map((a) =>
      ynabAPI.transactions.getTransactionsByAccount(
        YNAB_PLAN_ID,
        a.id,
        ynab.GetTransactionsByAccountTypeEnum.Unapproved,
      ),
    ),
  );

  const accountNameById = new Map(
    targetAccounts.map((account) => [account.id, account.name]),
  );

  const unapproved = txResponses.flatMap((response) =>
    response.data.transactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      payeeName: transaction.payee_name ?? '',
      memo: transaction.memo ?? '',
      amount: transaction.amount,
      accountId: transaction.account_id,
      accountName: accountNameById.get(transaction.account_id) ?? '',
    })),
  );

  console.log(
    `Found ${unapproved.length} unapproved transaction(s). Categorizing...`,
  );

  const allCategories = categoriesResponse.data.category_groups.flatMap(
    (group) =>
      group.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        group: group.name,
      })),
  );

  const amazonHistoryPath = path.join(inputDir, 'AmazonOrderHistory.csv');
  let recentOrders: {
    orderId: string;
    date: string;
    product: string;
    total: string;
  }[] = [];

  try {
    const csvRaw = await fs.readFile(amazonHistoryPath, 'utf-8');
    // Zod parse csv data
    const allOrders: Record<string, string>[] = csv.parse(csvRaw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    recentOrders = allOrders
      .filter((row) => {
        const year = new Date(row['Order Date'] ?? '').getFullYear();
        return year >= 2025;
      })
      .map((row) => ({
        orderId: row['Order ID'] ?? '',
        date: row['Order Date'] ?? '',
        product: row['Product Name'] ?? '',
        total: row['Total Amount'] ?? '',
      }));
    console.log(`Loaded ${recentOrders.length} Amazon order(s) from 2025+.`);
  } catch {
    console.warn(
      'No Amazon order history found — skipping (add input/AmazonOrderHistory.csv to improve Amazon categorization).',
    );
  }

  const amazonSection =
    recentOrders.length > 0
      ? dedent`
          ## Amazon Order History (2025-present)
          ${JSON.stringify(recentOrders, null, 2)}
        `
      : '';

  const prompt = dedent`
    You are a personal finance assistant. Categorize each of the following bank transactions into one of the provided YNAB categories.

    For transactions where the payee is Amazon, use the Amazon Order History below to determine what was purchased and choose the most specific matching category.

    Additionally, based on the transactions, suggest any new categories or category groups that would improve the budget organization. Only suggest categories that don't already exist. These suggestions are for future use only — do not use suggested categories when categorizing the current transactions; only use categories from the provided list above.

    ${amazonSection}

    ## Categories
    ${JSON.stringify(allCategories, null, 2)}

    ## Transactions
    ${JSON.stringify(unapproved, null, 2)}
  `;

  console.log(`Prompt tokens: ${encode(prompt).length}`);

  const { output } = await generateText({
    model: openai('gpt-5.2'),
    prompt,
    output: Output.object({
      schema: z.object({
        categorizations: z.array(
          z.object({
            transactionId: z.string(),
            payeeName: z.string(),
            categoryId: z.string(),
            categoryName: z.string(),
          }),
        ),
        recommendations: z.array(
          z.object({
            categoryGroup: z.string(),
            categoryName: z.string(),
            reason: z.string(),
          }),
        ),
      }),
    }),
  });

  const txById = new Map(unapproved.map((tx) => [tx.id, tx]));

  const succeeded = output.categorizations
    .filter((cat) => txById.has(cat.transactionId))
    .map((cat) => ({
      accountId: txById.get(cat.transactionId)?.accountId,
      accountName: txById.get(cat.transactionId)?.accountName,
      ...cat,
    }));

  const failed = {
    unknownTxId: output.categorizations.filter(
      (cat) => !txById.has(cat.transactionId),
    ),
  };

  const result = {
    succeeded,
    failed,
    recommendations: output.recommendations,
  };

  console.log('AI categorizations:');
  console.log(JSON.stringify(result, null, 2));

  const categorizeOutputDir = path.join(outputDir, 'categorize');
  await fs.mkdir(categorizeOutputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(
    categorizeOutputDir,
    `categorizations-${timestamp}.json`,
  );
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

  console.log(`\nOutput saved to: ${outputPath}`);

  if (failed.unknownTxId.length > 0) {
    console.warn(
      `Warning: ${failed.unknownTxId.length} unknown transaction ID(s) skipped.`,
    );
  }

  console.log('\nUpdating transactions in YNAB...');
  await ynabAPI.transactions.updateTransactions(YNAB_PLAN_ID, {
    transactions: succeeded.map((cat) => ({
      id: cat.transactionId,
      category_id: cat.categoryId,
    })),
  });

  console.log(`Updated ${succeeded.length} transaction(s).`);
};
