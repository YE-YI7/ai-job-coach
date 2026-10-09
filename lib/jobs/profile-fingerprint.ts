import { createHash } from 'node:crypto';
import { OPEN_SEARCH_VERSION } from './open-search';
import { DOMESTIC_SEARCH_VERSION } from './live-sources';
import { PERSONALIZATION_VERSION } from './personalization';
import { RETRIEVAL_GATE_VERSION } from './retrieval-gate';
/** Same material and scope binding for search restoration and saved judgments. */
export const profileFingerprint = (profile: { role: string; location?: string; resumeText?: string }, tiers: string[]) =>
  createHash('sha256').update(JSON.stringify([OPEN_SEARCH_VERSION, DOMESTIC_SEARCH_VERSION, PERSONALIZATION_VERSION, RETRIEVAL_GATE_VERSION, profile.role, profile.location, profile.resumeText, [...tiers].sort()])).digest('hex');
