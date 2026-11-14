/**
 * 答题链路·callLLM 接线回归：已连接 TokenPay 的账号在带生成上下文的调用
 * （模拟面试出题/答题评估都经 runWithGenerationContext）必须翻到网关、
 * 并落到 resolveTokenDanceModel 解析出的模型上；解析层的显式报错必须原样
 * 透出（不重试、不换模型、不静默降级）；400 不做无意义重试；余额类错误
 * 转成 TokenPayError 让 UI 给恢复动作。
 */

jest.mock("openai", () => {
  const create = jest.fn();
  (globalThis as Record<string, unknown>).__openaiCreate = create;
  class FakeOpenAI {
    options: unknown;
    chat = { completions: { create: (...args: unknown[]) => create(...args) } };
    constructor(options: unknown) {
      this.options = options;
      (globalThis as Record<string, unknown>).__openaiOptions = options;
    }
  }
  return { __esModule: true, default: FakeOpenAI };
});

jest.mock("./generation-context", () => ({ getGenerationContext: jest.fn() }));
jest.mock("./tokenpay", () => {
  class TokenPayError extends Error {
    status: number;
    recoveryAction: string;
    constructor(message: string, status: number, recoveryAction: string) {
      super(message);
      this.name = "TokenPayError";
      this.status = status;
      this.recoveryAction = recoveryAction;
    }
  }
  return {
    getTokenPayCredential: jest.fn(),
    tokenDanceAttributionHeaders: () => ({ "x-client": "test" }),
    TokenPayError,
  };
});
jest.mock("./coach-harness/chat-models", () => ({ resolveTokenDanceModel: jest.fn() }));
jest.mock("./llm-telemetry", () => ({
  recordGenerationEvent: jest.fn().mockResolvedValue(undefined),
  normalizeGenerationUsage: (usage: Record<string, unknown> | null | undefined) => ({
    inputTokens: Number(usage?.prompt_tokens ?? 0),
    outputTokens: Number(usage?.completion_tokens ?? 0),
    totalTokens: Number(usage?.total_tokens ?? 0),
    cacheHitTokens: 0,
    cacheMissTokens: 0,
  }),
  estimateGenerationCost: () => ({ estimatedCostUsd: 0, pricingVersion: null }),
  classifyGenerationFailure: () => "unknown",
}));

import { callLLM, buildChatCompletionRequest } from "./llm";
import { getGenerationContext } from "./generation-context";
import { getTokenPayCredential } from "./tokenpay";
import { resolveTokenDanceModel } from "./coach-harness/chat-models";
import {resumeConversationLlmOptions} from './coach-harness/resume-conversation-model';
import {recordGenerationEvent} from './llm-telemetry';

const create = (globalThis as Record<string, unknown>).__openaiCreate as jest.Mock;
const messages = [{ role: "user" as const, content: "评估这个回答" }];

function completion(text: string) {
  return { choices: [{ message: { content: text }, finish_reason: "stop" }], usage: null, model: "m" };
}

test('server F6 tools retain the selected gateway model and allow an immediate complete draft',async()=>{
  (getGenerationContext as jest.Mock).mockReturnValue({userId:'u',operation:'resume_draft'});
  (getTokenPayCredential as jest.Mock).mockResolvedValue('existing-key');
  (resolveTokenDanceModel as jest.Mock).mockResolvedValue('deepseek-v4-flash');
  create.mockClear();create.mockResolvedValue(completion('完整简历正文'));
  const nativeTools=[{type:'function' as const,function:{name:'write_output',description:'交稿',parameters:{type:'object'}}}];
  expect(await callLLM(messages,{provider:'deepseek',model:'deepseek-v4-flash',nativeTools,resumeF6Tools:true,maxRetries:0})).toBe('完整简历正文');
  expect(create.mock.calls[0][0]).toMatchObject({model:'deepseek-v4-flash',tool_choice:'auto',tools:nativeTools});
  expect(resolveTokenDanceModel).toHaveBeenCalledWith('u','deepseek-v4-flash');
  await expect(callLLM(messages,{nativeTools:[{type:'function',function:{name:'arbitrary_execution',description:'x',parameters:{}}}],resumeF6Tools:true}))
    .rejects.toThrow('F6_TOOL_SCOPE_INVALID');
});

test('scoped context tools reach ordinary production F6 while arbitrary tools remain unavailable', async () => {
  const previous = {...process.env};
  const names = ['knowledge_search', 'knowledge_read', 'memory_search', 'memory_read'];
  const nativeTools = names.map(name => ({type: 'function' as const,
    function: {name, description: 'read-only scoped query', parameters: {type: 'object'}}}));
  try {
    process.env.F6_QA_CONTEXT_TOOLS = 'v1'; process.env.F6_QA_USER_ID = 'qa'; process.env.F6_QA_BUDGET_ID = 'budget';
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'qa', operation: 'resume_draft'});
    (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
    create.mockResolvedValue(completion('完整新稿'));
    expect(await callLLM(messages, {nativeTools, resumeF6Tools: true, maxRetries: 0})).toBe('完整新稿');
    expect(create.mock.calls[0][0]).toMatchObject({tools: nativeTools, tool_choice: 'auto'});
    create.mockClear();
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'ordinary', operation: 'resume_draft'});
    await expect(callLLM(messages, {nativeTools, resumeF6Tools: true, maxRetries: 0})).resolves.toBe('完整新稿');
    expect(create).toHaveBeenCalledTimes(1);
    create.mockClear();
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'qa', operation: 'resume_draft'});
    await expect(callLLM(messages, {nativeTools: [{type: 'function', function: {
      name: 'arbitrary_execution', description: 'not exposed', parameters: {type: 'object'},
    }}], resumeF6Tools: true})).rejects.toThrow('F6_TOOL_SCOPE_INVALID');
    expect(create).not.toHaveBeenCalled();
  } finally {
    for (const key of ['F6_QA_CONTEXT_TOOLS', 'F6_QA_USER_ID', 'F6_QA_BUDGET_ID']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});

test('管理员原生工具确实到达SDK，空正文的tool_calls原样回传且计量，不触发空响应重试', async () => {
  (getGenerationContext as jest.Mock).mockReturnValue({userId: 'u', operation: 'admin_trial'});
  (getTokenPayCredential as jest.Mock).mockResolvedValue('existing-key');
  const nativeTools = [{type: 'function' as const, function: {name: 'context_load', description: 'read',
    parameters: {type: 'object', properties: {id: {type: 'string'}}, required: ['id']}}}];
  const calls = [{id: 'call-native-one', type: 'function', function: {name: 'context_load', arguments: '{"id":"one"}'}}];
  create.mockResolvedValue({model: 'deepseek-v4-flash', usage: {prompt_tokens: 23, completion_tokens: 17},
    choices: [{finish_reason: 'tool_calls', message: {content: null, tool_calls: calls}}]});
  const onUsage = jest.fn();
  const output = await callLLM(messages, {provider: 'tokendance', model: 'deepseek-v4-flash',
    requireExactConnectedModel: true, nativeTools, responseFormat: 'json_object', maxRetries: 0, onUsage});
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toMatchObject({tools: nativeTools, tool_choice: 'required'});
  expect(create.mock.calls[0][0]).not.toHaveProperty('response_format');
  expect(JSON.parse(output).tool_calls).toEqual(calls);
  expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({inputTokens: 23, outputTokens: 17}));
});

test('原生工具仅显式管理员精确连接启用，不影响渐进聊天，也不静默回退', async () => {
  const nativeTools = [{type: 'function' as const, function: {name: 'read', description: 'read', parameters: {type: 'object'}}}];
  await expect(callLLM(messages, {nativeTools})).rejects.toThrow('NATIVE_TOOLS_EXPERIMENT_ONLY');
  await expect(callLLM(messages, {nativeTools, requireExactConnectedModel: true, onDelta: jest.fn()}))
    .rejects.toThrow('NATIVE_TOOLS_EXPERIMENT_ONLY');
  expect(create).not.toHaveBeenCalled();
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.LLM_STUB;
  delete process.env.HOSTED_LLM_PROVIDER;
  delete process.env.HOSTED_LLM_MODEL;
  delete process.env.STEPFUN_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  (resolveTokenDanceModel as jest.Mock).mockImplementation((_u: string, model: string) => Promise.resolve(model));
});

describe("站点 StepFun 接线", () => {
  beforeEach(() => {
    process.env.HOSTED_LLM_PROVIDER = "stepfun";
    process.env.STEPFUN_API_KEY = "test-step-key";
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "new-user", operation: "intake" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
    create.mockResolvedValue(completion("ok"));
  });
  afterEach(() => {
    delete process.env.HOSTED_LLM_PROVIDER;
    delete process.env.HOSTED_LLM_MODEL;
    delete process.env.STEPFUN_API_KEY;
  });
  test("旧 DeepSeek 路由落到已配置站点模型、官方地址和站点密钥", async () => {
    await callLLM(messages, {model:"deepseek-chat",timeoutMs:100});
    expect(create.mock.calls[0][0].model).toBe("step-3.7-flash");
    expect((globalThis as Record<string, unknown>).__openaiOptions).toMatchObject({apiKey:"test-step-key",baseURL:"https://api.stepfun.com/v1"});
  });
  test.each(['resume_draft', 'resume_review'])('F6 official Flash bypasses hosted Step for %s without charging a linked account', async operation => {
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'qa', operation});
    (getTokenPayCredential as jest.Mock).mockResolvedValue('personal-key-not-to-use');
    create.mockResolvedValue({...completion('真实输出'), model: 'deepseek-flash'});
    const nativeTools = operation === 'resume_draft' ? [{type: 'function' as const,
      function: {name: 'write_output', description: '交稿', parameters: {type: 'object'}}}] : undefined;
    const options = {provider: 'deepseek' as const, model: 'deepseek-flash', siteFunded: true,
      exactSiteF6Model: 'deepseek-flash' as const, maxRetries: 0,
      ...(nativeTools ? {nativeTools, resumeF6Tools: true as const} : {})};
    expect(await callLLM(messages, options)).toBe('真实输出');
    expect(create.mock.calls[0][0].model).toBe('deepseek-flash');
    expect((globalThis as Record<string, unknown>).__openaiOptions)
      .toMatchObject({apiKey: 'test-deepseek-key', baseURL: 'https://api.deepseek.com', maxRetries: 0});
    expect(getTokenPayCredential).not.toHaveBeenCalled();
  });
  test('a wrong served model is visible failure and cannot trigger another paid request', async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'qa', operation: 'resume_review'});
    create.mockResolvedValue({...completion('不该接收'), model: 'step-3.7-flash'});
    await expect(callLLM(messages, {provider: 'deepseek', model: 'deepseek-flash', siteFunded: true,
      exactSiteF6Model: 'deepseek-flash', maxRetries: 0})).rejects.toThrow('F6_SERVED_MODEL_MISMATCH');
    expect(create).toHaveBeenCalledTimes(1);
  });
  test.each(['resume_draft', 'resume_review'])('ordinary production F6 uses accepted Flash without QA funding for %s', async operation => {
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'ordinary-user', operation});
    (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
    create.mockResolvedValue({...completion('真实输出'), model: 'deepseek-flash'});
    const nativeTools = operation === 'resume_draft' ? [{type: 'function' as const,
      function: {name: 'knowledge_search', description: '查方法', parameters: {type: 'object'}}}] : undefined;
    const result = await callLLM(messages, {provider: 'deepseek', model: 'deepseek-flash', resumeF6Model: true,
      siteFunded: false, maxRetries: 0, ...(nativeTools ? {nativeTools, resumeF6Tools: true} : {})});
    expect(result).toBe('真实输出');
    expect(create.mock.calls[0][0].model).toBe('deepseek-flash');
    expect(getTokenPayCredential).toHaveBeenCalledWith('ordinary-user');
    expect((globalThis as Record<string, unknown>).__openaiOptions)
      .toMatchObject({apiKey: 'test-deepseek-key', baseURL: 'https://api.deepseek.com'});
  });
  test('production F6 keeps the connected wallet and canonical Flash id, not a hosted-funded shortcut', async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'connected-user', operation: 'resume_review'});
    (getTokenPayCredential as jest.Mock).mockResolvedValue('personal-key');
    (resolveTokenDanceModel as jest.Mock).mockResolvedValue('deepseek-v4.1-flash');
    create.mockResolvedValue({...completion('真实输出'), model: 'deepseek-v4.1-flash'});
    expect(await callLLM(messages, {provider: 'deepseek', model: 'deepseek-flash', resumeF6Model: true,
      siteFunded: false, maxRetries: 0})).toBe('真实输出');
    expect(resolveTokenDanceModel).toHaveBeenCalledWith('connected-user', 'deepseek-v4.1-flash');
    expect(create.mock.calls[0][0].model).toBe('deepseek-v4.1-flash');
    expect((globalThis as Record<string, unknown>).__openaiOptions)
      .toMatchObject({apiKey: 'personal-key', baseURL: 'https://tokendance.space/gateway/v1'});
  });
  test('ordinary F6 rejects wrong served model without retrying', async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'ordinary-user', operation: 'resume_review'});
    (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
    create.mockResolvedValue({...completion('错模型'), model: 'step-3.7-flash'});
    await expect(callLLM(messages, {provider: 'deepseek', model: 'deepseek-flash', resumeF6Model: true,
      maxRetries: 0})).rejects.toThrow('F6_SERVED_MODEL_MISMATCH');
    expect(create).toHaveBeenCalledTimes(1);
  });
  test("公开工具无用户上下文仍使用站点模型", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue(undefined);
    process.env.HOSTED_LLM_MODEL = "step-3.5-flash";
    await callLLM(messages, {timeoutMs:100});
    expect(create.mock.calls[0][0].model).toBe("step-3.5-flash");
    expect(getTokenPayCredential).not.toHaveBeenCalled();
  });
  test("已连接 TokenPay 优先，不挪用站点密钥", async () => {
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    await callLLM(messages, {model:"glm-5.3",timeoutMs:100});
    expect(create.mock.calls[0][0].model).toBe("glm-5.3");
    expect((globalThis as Record<string, unknown>).__openaiOptions).toMatchObject({apiKey:"tp-key",baseURL:"https://tokendance.space/gateway/v1"});
  });
  test('站点赠送的单段体验不读用户网关密钥，仍保留用户审计归属',async()=>{
    (getTokenPayCredential as jest.Mock).mockResolvedValue('tp-key');
    await callLLM(messages,{siteFunded:true,timeoutMs:100});
    expect(getTokenPayCredential).not.toHaveBeenCalled();
    expect((globalThis as Record<string,unknown>).__openaiOptions).toMatchObject({apiKey:'test-step-key',baseURL:'https://api.stepfun.com/v1'});
    expect(recordGenerationEvent).toHaveBeenCalledWith(expect.objectContaining({userId:'new-user',provider:'stepfun'}));
  });
  test("缺密钥明确失败，不退到 DeepSeek", async () => {
    delete process.env.STEPFUN_API_KEY;
    await expect(callLLM(messages)).rejects.toThrow("STEPFUN_API_KEY");
    expect(create).not.toHaveBeenCalled();
  });
  test("站点 402 不重试、不切其他模型", async () => {
    create.mockRejectedValue(Object.assign(new Error("Insufficient Balance"),{status:402}));
    await expect(callLLM(messages,{timeoutMs:100})).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });
  test("JSON 与低推理预算参数，不复用 DeepSeek thinking 协议", () => {
    const request=buildChatCompletionRequest(messages,"stepfun","step-3.7-flash",{responseFormat:"json_object"});
    expect(request).toMatchObject({reasoning_effort:"low",response_format:{type:"json_object"}});
    expect(request.thinking).toBeUndefined();
  });
  test("推理 allowance 仅给 Step，总上限有界，不放大用户网关预算", () => {
    const options={maxTokens:1400,reasoningBudgetTokens:9000,responseFormat:"json_object" as const};
    expect(buildChatCompletionRequest(messages,"stepfun","step-3.7-flash",options).max_tokens).toBe(9592);
    expect(buildChatCompletionRequest(messages,"tokendance","glm-5.3",options).max_tokens).toBe(1400);
    expect(buildChatCompletionRequest(messages,"deepseek","deepseek-chat",options).max_tokens).toBe(1400);
  });
  test('only hosted Step receives strict reviewer schema; connected gateways keep JSON mode and budgets',()=>{
    const responseSchema={name:'review',schema:{type:'object',properties:{status:{type:'string'}},required:['status'],additionalProperties:false}};
    const options={responseFormat:'json_object' as const,responseSchema,maxTokens:2200,reasoningBudgetTokens:8192};
    expect(buildChatCompletionRequest(messages,'stepfun','step-3.7-flash',options)).toMatchObject({max_tokens:10392,response_format:{type:'json_schema',json_schema:{strict:true,...responseSchema}}});
    expect(buildChatCompletionRequest(messages,'tokendance','deepseek-v4-flash',options)).toMatchObject({max_tokens:2200,response_format:{type:'json_object'}});
  });
});

describe("callLLM 的 TokenPay 网关接线", () => {
  test('administrator exact-model lane loads the existing server credential and never substitutes via catalog', async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'owner', operation: 'admin_resume_harness_comparison'});
    (getTokenPayCredential as jest.Mock).mockResolvedValue('fixture-key');
    create.mockResolvedValue(completion('ok'));
    await callLLM(messages, {provider: 'tokendance', model: 'deepseek-v4-flash', requireExactConnectedModel: true, maxRetries: 0});
    expect(getTokenPayCredential).toHaveBeenCalledWith('owner');
    expect(resolveTokenDanceModel).not.toHaveBeenCalled();
    expect((globalThis as Record<string, unknown>).__openaiOptions).toMatchObject({apiKey: 'fixture-key', baseURL: 'https://tokendance.space/gateway/v1', maxRetries: 0});
    expect(create.mock.calls[0][0].model).toBe('deepseek-v4-flash');
  });
  test('exact-model lane fails closed on credential loss, wrong provider or missing actor, never uses hosted funds', async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({userId: 'owner'});
    (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
    await expect(callLLM(messages, {provider: 'tokendance', model: 'deepseek-v4-flash', requireExactConnectedModel: true})).rejects.toThrow('EXACT_CONNECTED_MODEL_KEY_REQUIRED');
    await expect(callLLM(messages, {provider: 'deepseek', model: 'deepseek-v4-flash', requireExactConnectedModel: true})).rejects.toThrow('EXACT_CONNECTED_MODEL_CONTEXT_REQUIRED');
    (getGenerationContext as jest.Mock).mockReturnValue(undefined);
    await expect(callLLM(messages, {provider: 'tokendance', model: 'deepseek-v4-flash', requireExactConnectedModel: true})).rejects.toThrow('EXACT_CONNECTED_MODEL_CONTEXT_REQUIRED');
    expect(create).not.toHaveBeenCalled();
  });
  test('resume mentor uses bounded gateway streaming, preserves model and parses only complete JSON',async()=>{
    (getGenerationContext as jest.Mock).mockReturnValue({userId:'fixture',operation:'resume_conversation'});
    (getTokenPayCredential as jest.Mock).mockResolvedValue('fixture-key');
    (resolveTokenDanceModel as jest.Mock).mockResolvedValue('deepseek-v4-flash');
    const result='{"action":"discuss","reply":"先讨论亮点。"}';
    create.mockResolvedValue((async function*(){yield {model:'deepseek-v4-flash',choices:[{delta:{content:result.slice(0,20)}}]};yield {choices:[{delta:{content:result.slice(20)},finish_reason:'stop'}]};})());
    const options=resumeConversationLlmOptions();expect(options.timeoutMs).toBe(45000);
    expect(await callLLM(messages,{...options,timeoutMs:100})).toBe(result);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({stream:true,model:'deepseek-v4-flash',response_format:{type:'json_object'},max_tokens:1400});
    expect((globalThis as Record<string,unknown>).__openaiOptions).toMatchObject({maxRetries:0,timeout:100});
  });
  test('gateway timeout does not auto-retry or silently bill another provider',async()=>{
    (getGenerationContext as jest.Mock).mockReturnValue({userId:'fixture',operation:'resume_conversation'});
    (getTokenPayCredential as jest.Mock).mockResolvedValue('fixture-key');
    create.mockRejectedValue(new Error('Request timed out.'));
    await expect(callLLM(messages,{...resumeConversationLlmOptions(),timeoutMs:100})).rejects.toThrow('timed out');
    expect(create).toHaveBeenCalledTimes(1);
  });
  test("已连接账号 + 生成上下文：翻到网关，并打到解析后的模型", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "mock_interview_answer_assessment" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    (resolveTokenDanceModel as jest.Mock).mockResolvedValue("deepseek-v4-flash-0731");
    create.mockResolvedValue(completion("ok"));

    await callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" });

    expect(resolveTokenDanceModel).toHaveBeenCalledWith("u-1", "deepseek-chat");
    const [request] = create.mock.calls[0];
    expect(request.model).toBe("deepseek-v4-flash-0731");
  });

  test("未连接账号：保持托管 DeepSeek，不触发网关解析", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "x" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue(null);
    create.mockResolvedValue(completion("ok"));

    await callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" });

    expect(resolveTokenDanceModel).not.toHaveBeenCalled();
    const [request] = create.mock.calls[0];
    expect(request.model).toBe("deepseek-chat");
  });

  test("无生成上下文（公开工具）：不改 provider，也不查凭据", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue(undefined);
    create.mockResolvedValue(completion("ok"));

    await callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" });

    expect(getTokenPayCredential).not.toHaveBeenCalled();
    expect(resolveTokenDanceModel).not.toHaveBeenCalled();
  });

  test("解析层显式报错：原样透出，绝不打到网关（不换模型计费）", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "x" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    (resolveTokenDanceModel as jest.Mock).mockRejectedValue(
      new Error("TokenPay 模型「glm-5.3」当前不可用，未替换模型。请选择其他模型后重试。")
    );

    await expect(callLLM(messages, { timeoutMs: 100, model: "glm-5.3" })).rejects.toThrow("未替换模型");
    expect(create).not.toHaveBeenCalled();
  });

  test("网关 400（模型不存在）：不重试、透出具名错误", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "x" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    create.mockRejectedValue(Object.assign(new Error("400 模型不存在"), { status: 400 }));

    await expect(callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" })).rejects.toThrow("LLM API 调用失败");
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("余额不足恢复头：转 TokenPayError，文案给出充值指引", async () => {
    (getGenerationContext as jest.Mock).mockReturnValue({ userId: "u-1", operation: "x" });
    (getTokenPayCredential as jest.Mock).mockResolvedValue("tp-key");
    create.mockRejectedValue({
      message: "payment required",
      status: 402,
      headers: { "tokendance-recovery-action": "top_up_balance" },
    });

    await expect(callLLM(messages, { timeoutMs: 100, model: "deepseek-chat" })).rejects.toMatchObject({
      name: "TokenPayError",
      message: "TokenPay 余额不足，请充值后重试",
      recoveryAction: "top_up_balance",
    });
  });
});
