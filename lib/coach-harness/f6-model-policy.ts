import type {callLLM} from '@/lib/llm';

export const F6_OFFICIAL_MODEL = 'deepseek-flash' as const;
/** Same accepted model, with the product's existing quota and connected-wallet
 * routing intact. The hosted Step default must not replace this model. */
export function f6ProductionLlmOptions(settings: Parameters<typeof callLLM>[1]) {
  return {...settings, provider: 'deepseek' as const, model: F6_OFFICIAL_MODEL,
    resumeF6Model: true as const, maxRetries: 0};
}
export function f6OfficialLlmOptions(settings: Parameters<typeof callLLM>[1]) {
  return {...settings, provider: 'deepseek' as const, model: F6_OFFICIAL_MODEL,
    siteFunded: true, exactSiteF6Model: F6_OFFICIAL_MODEL, maxRetries: 0};
}
export function assertF6OfficialServedModel(model: string | undefined) {
  if (!model || !['deepseek-flash', 'deepseek-v4.1-flash', 'deepseek-v4.1-flash-1017'].includes(model.toLowerCase())) {
    throw Error('F6_SERVED_MODEL_MISMATCH');
  }
}
