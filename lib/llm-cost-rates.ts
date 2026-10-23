/** Reference estimates only. Never debit points or change model routing here.
 * Verified 2026-10-23 from the primary sources below. CNY->USD uses an explicit
 * 7.2 planning assumption, NOT a live FX quote or a supplier settlement rate. */
export const MODEL_COST_AS_OF = '2026-10-23';
export const COST_CNY_PER_USD_ASSUMPTION = 7.2;
export const MODEL_COST_SOURCES = {
  stepfun: 'https://platform.stepfun.com/docs/zh/pricing/details',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
  tokendance: 'https://tokendance.space/portal/api/models/all',
} as const;

type Rate = {
  input: number;
  cached: number;
  output: number;
  currency: 'CNY' | 'USD';
  basis: 'reference' | 'peak-upper-bound';
};
const cny = (input:number,cached:number,output:number):Rate =>
  ({input,cached,output,currency:'CNY',basis:'reference'});
const usdPeak = (input:number,cached:number,output:number):Rate =>
  ({input,cached,output,currency:'USD',basis:'peak-upper-bound'});
const gatewayPeak = (input:number,cached:number,output:number):Rate =>
  ({...cny(input,cached,output),basis:'peak-upper-bound'});

// Per million INPUT cache misses / INPUT hits / OUTPUT. Exact IDs only.
// Direct Step prices are not the discounted TokenDance gateway prices.
const RATES: Record<string,Record<string,Rate>> = {
  stepfun: {
    'step-3.7-flash': cny(1.35,0.27,8.1),
    'step-5-preview': cny(7,0.70,20),
    'step-3.5-flash': cny(0.7,0.14,2.1),
    'step-3.5-flash-2603': cny(0.7,0.14,2.1),
    'step-1o-turbo-vision': cny(2.5,0.5,8),
  },
  deepseek: {
    // Official docs explicitly retain these Flash aliases. No guessed mapping
    // of old deepseek-chat/reasoner or arbitrary '*flash*' model names.
    'deepseek-flash': usdPeak(0.3,0.006,1.2),
    'deepseek-v4-flash': usdPeak(0.3,0.006,1.2),
    'deepseek-v4-flash-vision-exp': usdPeak(0.3,0.006,1.2),
    'deepseek-v4-pro': usdPeak(1.32,0.044,3.96),
  },
  tokendance: {
    // Public openai:chat-completions rates, not reference/struck-out tariffs.
    // Time-priced models use the highest published period, labelled as such.
    'step-3.7-flash': cny(1.08,0.216,6.48),
    'step-5-preview': cny(7,0.35,20),
    'deepseek-v4-flash': cny(1,0.2,2),
    'deepseek-v4.1-flash': gatewayPeak(1.6,0.032,6.4),
    'deepseek-v4-flash-0731': gatewayPeak(2.4,0.08,7.2),
    'glm-5.3': cny(7.2,1.8,25.2),
    'kimi-k3': cny(20,2,100),
    'qwen3.8-max-0902': cny(12,1.5,36),
    'hy4-preview': cny(6,0.3,18),
  },
};

export function modelCostRate(provider:string,model:string) {
  if (!Object.hasOwn(RATES,provider)) return null;
  const models = RATES[provider];
  if (!Object.hasOwn(models,model)) return null;
  return models[model];
}
