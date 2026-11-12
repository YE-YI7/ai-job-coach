import origin from './f6-origin.json';
import {F6PublicResearchPrivacy, f6PublicUrl} from './f6-public-research-privacy';
export {f6PublicUrl} from './f6-public-research-privacy';

export const F6_MAX_PUBLIC_REQUESTS = origin.maxPublicRequests;
export type F6PublicBudget = {limit: number; used: number; remaining: number};

type SearchItem = {url: string; title: string; publishedAt: string | null; author: string | null;
  sourceType: string; excerpt: string; indexOnlyNotRead: boolean};
/** Same keyless service and request budget, with author-chosen public queries.
 * Private text is checked locally, not sent to a second model or search service. */
export class F6PublicTools {
  private requests = 0;
  private indexed = new Map<string, {title: string; sourceType: string}>();
  constructor(private domain: string, private transport: typeof fetch = fetch,
    private privacy = new F6PublicResearchPrivacy()) {}

  budget(): F6PublicBudget {
    return {limit: F6_MAX_PUBLIC_REQUESTS, used: this.requests,
      remaining: Math.max(0, F6_MAX_PUBLIC_REQUESTS - this.requests)};
  }

  restoreCompletedCalls(calls: Array<{name: string; output: Record<string, unknown>}>) {
    if (this.requests || calls.length > F6_MAX_PUBLIC_REQUESTS) throw Error('PUBLIC_CHECKPOINT_INVALID');
    for (const call of calls) {
      if (!['search', 'fetch'].includes(call.name) || call.output.error) throw Error('PUBLIC_CHECKPOINT_INVALID');
      if (call.name === 'search') {
        const results = call.output.results;
        if (!Array.isArray(results)) throw Error('PUBLIC_CHECKPOINT_INVALID');
        for (const item of results) this.indexed.set(f6PublicUrl(item.url), item);
      }
    }
    this.requests = calls.length;
  }

  private async mcp(name: string, args: Record<string, unknown>): Promise<string> {
    if (this.requests >= F6_MAX_PUBLIC_REQUESTS) throw Error('PUBLIC_REQUEST_BUDGET');
    this.requests++;
    const response = await this.transport('https://mcp.exa.ai/mcp', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(18_000),
      headers: {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}}),
    });
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 1_500_000) throw Error('PUBLIC_RESPONSE_TOO_LARGE');
    const rows = raw.startsWith('{') ? [raw] : raw.split(/\r?\n/).filter(x => x.startsWith('data: ')).map(x => x.slice(6));
    let result;
    for (const row of rows) {
      const parsed = JSON.parse(row);
      if (parsed.error) throw Error('PUBLIC_SEARCH_UNAVAILABLE_NO_PAID_FALLBACK');
      if (parsed.result) { result = parsed.result; break; }
    }
    if (!response.ok || !result || result.isError) throw Error('PUBLIC_SEARCH_UNAVAILABLE_NO_PAID_FALLBACK');
    const text = (result.content || []).filter((c: {type: string}) => c.type === 'text')
      .map((c: {text?: string}) => c.text || '').join('\n');
    if (!text.trim()) throw Error('PUBLIC_EMPTY_RESPONSE');
    return text;
  }

  async search(rawQuery: unknown) {
    const query = this.privacy.query(rawQuery);
    const raw = await this.mcp('web_search_exa', {query, numResults: 5,
      objective: 'Investigate the public question expressed by the query. Follow its chosen angle; use original interviews, '
        + 'demonstrations, independent tests or official sources when relevant. Identify author/date and original source '
        + 'where available. Distinguish public claims from observations; do not infer private hiring rules or candidate facts.',
    });
    const results: SearchItem[] = [];
    for (const chunk of raw.split(/(?=(?:^|\n)Title:\s*)/)) {
      const matched = chunk.match(/(?:^|\n)URL:\s*(https:\/\/[^\s]+)/);
      if (!matched) continue;
      let url;
      try { url = f6PublicUrl(matched[1]); } catch { continue; }
      if (results.some(item => item.url === url)) continue;
      const host = new URL(url).hostname;
      const item = {url, title: chunk.match(/(?:^|\n)Title:\s*([^\n]+)/)?.[1] || url,
        publishedAt: chunk.match(/(?:^|\n)(?:Published(?:\s+Date)?|Date):\s*([^\n]+)/)?.[1] || null,
        author: chunk.match(/(?:^|\n)Author:\s*([^\n]+)/)?.[1] || null,
        sourceType: this.domain && (host === this.domain || host.endsWith('.' + this.domain))
          ? 'official_self_description' : 'external_attributed_source',
        excerpt: chunk.slice(0, 1000), indexOnlyNotRead: true};
      results.push(item); this.indexed.set(url, item);
    }
    return {query, results: results.slice(0, 4), warning: '索引摘录；事实核查需 fetch。公开内容不证明内部筛选偏好。'};
  }

  async read(raw: unknown) {
    const urls = this.privacy.urls(raw);
    const rawText = await this.mcp('web_fetch_exa', {urls, maxCharacters: 4200});
    const chunks = rawText.split(/(?=(?:^|\n)URL:\s*https:\/\/)/);
    const pages = urls.flatMap(url => {
      const text = chunks.filter(c => c.match(/^\s*URL:\s*(https:\/\/[^\s]+)/)?.[1] === url).join('\n');
      const meta = this.indexed.get(url) || {title: url,
        sourceType: this.domain && (new URL(url).hostname === this.domain || new URL(url).hostname.endsWith('.' + this.domain))
          ? 'official_self_description' : 'external_attributed_source'};
      return text ? [{url, title: meta.title, sourceType: meta.sourceType, text: text.slice(0, 2200)}] : [];
    });
    if (!pages.length) throw Error('PUBLIC_READER_DID_NOT_IDENTIFY_SOURCE');
    return {pages};
  }
}
