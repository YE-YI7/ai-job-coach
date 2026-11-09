import {createHash} from 'node:crypto';
import origin from './f6-origin.json';

export const F6_RUNTIME_VERSION = 'f6-origin-runtime-v3' as const;

/** Public, non-personal release receipt. The writer and the health endpoint
 * share this identity; an environment flag cannot secretly select an old writer. */
export function f6RuntimeIdentity() {
  return {
    version: F6_RUNTIME_VERSION,
    originSystemSha256: origin.systemHash,
    toolsSha256: createHash('sha256').update(JSON.stringify(origin.tools)).digest('hex'),
    tools: origin.tools.map(tool => tool.function.name),
    maxAuthorCalls: origin.maxAuthorCalls,
    maxPublicRequests: origin.maxPublicRequests,
    automaticJudge: false,
    modelSelection: 'preserve-user-selection',
  };
}
