import {createHash} from 'node:crypto';
import {F6_BASIC_INFORMATION_BOUNDARY, f6AuthorContract} from './f6-author-contract';
import {f6RuntimeIdentity} from './f6-runtime-contract';
import {f6InitialMessages, runF6ResumeWriter} from './resume-f6-writer';
import {F6ContextTools} from './f6-context-tools';

const savedRole = process.env.F6_TEMPORAL_ROLE_CONTRACT;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const original = '虚构测试甲\n学校甲｜专业乙｜本科｜2020.09—2026.06\n公司丙｜产品实习｜2025.02—2025.07';
const input = () => ({resume: original, jd: '', facts: [], request: '', answers: [], decisions: [],
  scope: 'whole' as const, format: {}, mentorCoaching: true as const,
  contextTools: new F6ContextTools({search: jest.fn(), read: jest.fn()}, undefined,
    {complete: true, documents: []})});

beforeEach(() => {delete process.env.F6_TEMPORAL_ROLE_CONTRACT;});
afterEach(() => {
  if (savedRole === undefined) delete process.env.F6_TEMPORAL_ROLE_CONTRACT;
  else process.env.F6_TEMPORAL_ROLE_CONTRACT = savedRole;
});

test.each([undefined, 'author-v1', 'hr-v1', 'both-v1'])(
  'basic-information guidance reaches both scopes exactly once under role variant %s', variant => {
    if (variant) process.env.F6_TEMPORAL_ROLE_CONTRACT = variant;
    for (const scope of ['whole', 'single'] as const) {
      const prompt = f6AuthorContract(scope);
      expect(prompt.split(F6_BASIC_INFORMATION_BOUNDARY)).toHaveLength(2);
      expect(prompt).toContain('不要求补齐原文未提供的字段');
      expect(prompt).toContain('不把实习写成全职');
      expect(prompt).toContain('不凭日期或其他经历自行补写在读、毕业等现状');
      expect(prompt).toContain('这不限制合理概括、专业表达或贡献角度的提炼');
    }
  },
);

test('removing only the approved paragraph reproduces the prior author prompts byte for byte', () => {
  for (const [scope, expected] of [
    ['whole', '25180abf0ee79cf0f11bb729dd851ea28426e491e3f393bff27b617d0926d7db'],
    ['single', 'ded753cdd75e74652c00e3814653eceed4bde8cc4c9990e0d3204a1990337f93'],
  ] as const) {
    expect(digest(f6AuthorContract(scope).replace('\n' + F6_BASIC_INFORMATION_BOUNDARY, ''))).toBe(expected);
  }
  process.env.F6_TEMPORAL_ROLE_CONTRACT = 'both-v1';
  expect(digest(f6AuthorContract('whole').replace('\n' + F6_BASIC_INFORMATION_BOUNDARY, '')))
    .toBe('4bfda23a68e0dea7cbe6a63a31fc5aa961475648bc7d1fdfe9c26a3f37a9fa60');
});

test('the formal writer gets guidance in system, not altered user facts or extra source fields', () => {
  const messages = f6InitialMessages(input());
  expect(messages[0]).toEqual({role: 'system', content: f6AuthorContract('whole')});
  const payload = JSON.parse(messages[1].content);
  expect(payload['resume.md']).toBe(original);
  expect(payload.personalMaterials).toEqual([]);
  expect(JSON.stringify(payload)).not.toContain(F6_BASIC_INFORMATION_BOUNDARY);
});

test('guidance creates no compulsory tool call, extra model hop or text-replacement gate', async () => {
  const run = jest.fn().mockResolvedValue(JSON.stringify({type: 'native_tool_calls', content: '',
    tool_calls: [{id: 'call-save', type: 'function', function: {name: 'write_output',
      arguments: JSON.stringify({resume_markdown: original, purpose: '保留完整基础履历，交付改稿'})}}]}));
  const result = JSON.parse(await runF6ResumeWriter(input(), run, jest.fn()));
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.fullDocument).toBe(original);
  expect(f6RuntimeIdentity()).toMatchObject({maxAuthorCalls: 12, maxHrCalls: 1,
    modelSelection: 'preserve-user-selection', resumeModel: 'deepseek-flash'});
});
