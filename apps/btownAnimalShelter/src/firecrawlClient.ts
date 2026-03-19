import Firecrawl from '@mendable/firecrawl-js';
import { env } from './env.ts';

export const firecrawl = new Firecrawl({ apiKey: env.FIRECRAWL_API_KEY });
