/** Local outbound checks, never a writing-quality judge. Queries and URLs can
 * be chosen freely; contact data, credentials and copied private passages cannot. */
import {isIP} from 'node:net';
const CONTACT = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?<!\d)(?:\+?86[ -]?)?1[3-9](?:[ -]?\d){9}(?!\d)|\b\+\d(?:[ -]?\d){8,14}\b/i;
const CREDENTIAL = /(?:token|secret|password|api[_-]?key|authorization|session|cookie)\s*[=:]|\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{20,}|xox[bp]-[\w-]{12,})/i;
const fold = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\u200b-\u200f\ufeff]+/g, '');
function decoded(text: string) {
  for (let depth = 0; depth < 3; depth++) {
    try { const next = decodeURIComponent(text); if (next === text) break; text = next; }
    catch { break; }
  }
  return text;
}

export function f6PublicUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !url.hostname.includes('.') || isIP(url.hostname.replace(/^\[|\]$/g, ''))
    || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)
    || /(?:token|secret|password|auth|session|key)=/i.test(url.search)) throw Error('PUBLIC_URL_REQUIRED');
  url.hash = '';
  return url.href;
}

export class F6PublicResearchPrivacy {
  private sources: string[];
  private names: string[];
  constructor(materials: string[] = []) {
    this.sources = materials.filter(Boolean).map(fold);
    this.names = materials.flatMap(text => {
      const explicit = [...text.matchAll(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:姓名|name)\s*[:：]\s*([^\n|｜，,]{2,40})/gi)]
        .map(match => match[1].trim());
      // Infer an unlabelled Chinese header only when it is accompanied by
      // contact data. A project heading is not evidence of a person's name.
      const header = text.split('\n').find(line => line.trim())?.replace(/^#+\s*/, '').trim() || '';
      const name = header.match(/^([\p{Script=Han}·]{2,5})(?:\s|[|｜（(]|$)/u)?.[1];
      return [...explicit, ...(name && CONTACT.test(text.slice(0, 300)) ? [name] : [])];
    }).map(fold);
  }
  private assertPublic(text: string) {
    const plain = decoded(text), normalized = fold(plain);
    const copiedPassage = this.sources.some(source => {
      // Short shared terms (e.g. "Agent Harness Context Engineering") are
      // legitimate research, not evidence of leaking a private passage.
      for (let at = 0; at + 80 <= normalized.length; at++) {
        if (source.includes(normalized.slice(at, at + 80))) return true;
      }
      return false;
    });
    if (CONTACT.test(plain) || CREDENTIAL.test(plain)
      || this.names.some(name => normalized.includes(name)) || copiedPassage) throw Error('PUBLIC_RESEARCH_PRIVATE_INPUT');
  }
  query(raw: unknown) {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 600) throw Error('PUBLIC_QUERY_REQUIRED');
    this.assertPublic(raw);
    return raw.trim();
  }
  urls(raw: unknown) {
    if (!Array.isArray(raw) || !raw.length || raw.length > 2 || raw.some(url => typeof url !== 'string')) {
      throw Error('PUBLIC_URL_LIST_REQUIRED');
    }
    return [...new Set(raw.map(url => {
      this.assertPublic(url);
      return f6PublicUrl(url);
    }))];
  }
}
