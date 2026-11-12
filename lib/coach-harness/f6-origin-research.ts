import type {F6PublicTools} from './f6-public-tools';

/** Frozen experiment compatibility only. The product's mentor-enabled tools
 * use free queries and public URLs directly, never this topic menu. */
export function f6OriginResearch(research: F6PublicTools, company: string,
  checkpoint: Array<{name: string; output: Record<string, unknown>}> = []) {
  const topics = {
    role: 'Agent product manager hiring job requirements iteration user feedback',
    team: 'team engineering product design culture AI-native founders interview',
    screening: 'Agent product manager recruiting qualifications education screening',
    agent_native: 'Agent product Context Engineering official blog tool use iteration',
  };
  const indexed = new Set(checkpoint.flatMap(call => call.name === 'search'
    ? (call.output.results as Array<{url: string}> || []).map(item => item.url) : []));
  return {
    search: async (topic: unknown) => {
      if (typeof topic !== 'string' || !Object.hasOwn(topics, topic)) throw Error('UNKNOWN_PUBLIC_TOPIC');
      if (!company || company.length > 80 || /[\r\n@]|\d{7,}|密钥|验证码|手机号|简历原文/.test(company)) {
        throw Error('PUBLIC_COMPANY_NAME_REQUIRED');
      }
      const output = await research.search(`${company} ${topics[topic as keyof typeof topics]}`);
      output.results.forEach(item => indexed.add(item.url));
      return {topic, results: output.results, warning: output.warning};
    },
    fetch: async (urls: unknown) => {
      if (!Array.isArray(urls) || urls.some(url => !indexed.has(url))) throw Error('FETCH_URL_NOT_FROM_PUBLIC_SEARCH');
      return research.read(urls);
    },
  };
}
