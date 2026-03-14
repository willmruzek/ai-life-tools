import { main as runCategorize } from './categorize.ts';
import { main as runRecommend } from './recommend.ts';

const [command] = process.argv.slice(2);

const run = async (): Promise<void> => {
  switch (command) {
    case 'categorize': {
      await runCategorize();
      return;
    }
    case 'recommend': {
      await runRecommend();
      return;
    }
    default: {
      console.error('Unknown or missing subcommand.');
      console.error('Usage: pnpm ynab <categorize|recommend>');
      process.exit(1);
    }
  }
};

await run();
