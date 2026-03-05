/**
 * Internet search tool using Tavily.
 * Provides the agent with the ability to search the web for
 * up-to-date information, documentation, and code examples.
 */

import { TavilySearch } from '@langchain/tavily';
import { createLogger } from '../UnityConnection/config';

const log = createLogger('movesia.knowledge-tools');

/**
 * Create the Tavily internet search tool.
 * Returns null if no API key is available.
 */
export function createInternetSearch (apiKey?: string) {
  const key = apiKey ?? process.env.TAVILY_API_KEY;
  if (!key) {
    log.debug('No TAVILY_API_KEY — web search disabled');
    return null;
  }
  log.debug('Web search tool created (tavily_search)');
  return new TavilySearch({
    tavilyApiKey: key,
    maxResults: 5,
  });
}
