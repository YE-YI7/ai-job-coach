import {f6DocumentSafetyIssues} from './resume-f6-preflight';
import {F6ToolSession} from './f6-tool-session';

const header = '姓名：陈甲\n邮箱：owner@example.invalid\n电话：13800138000';
const body = '负责整理门店退货原因，制作分类表，交给店长每周查看。';

test.each(['要更新简历', '个人简历', '教育经历', '任意标题'])('does not invent a name from the heading %s', title => {
  expect(f6DocumentSafetyIssues(`${title}\n${header}\n${body}`, `${header}\n${body}`)).toEqual([]);
});

test('does not pretend an unlabelled first line is a verified name', () => {
  expect(f6DocumentSafetyIssues('要更新简历\n' + body, body)).toEqual([]);
  // This gate has no trusted structured name for either bare line. It must not
  // claim to recognize which is a person's name based on Chinese word length.
  expect(f6DocumentSafetyIssues('陈甲\n' + body, '陈乙\n' + body)).toEqual([]);
});

test('identity values survive Markdown, reordering, deduplication and ordinary phone formatting', () => {
  const source = `要更新简历\n${header}\nowner@example.invalid\n${body}`;
  const candidate = `# 陈甲\n**邮箱**：OWNER@EXAMPLE.INVALID | 手机：+86 138-0013-8000\n${body}`;
  expect(f6DocumentSafetyIssues(source, candidate)).toEqual([]);
  expect(f6DocumentSafetyIssues(candidate, candidate)).toEqual([]);
});

test.each([
  header.replace('陈甲', '陈乙'),
  header.replace('陈甲', '陈甲乙'),
  header.replace('姓名：陈甲\n', ''),
  header.replace('owner@', 'another@'),
  header.replace('13800138000', '13900139000'),
  header.replace('电话：13800138000', ''),
  header + '\nnew@example.invalid',
  header + '\n电话：13900139000',
])('still rejects a real change to a reliable identity/contact value: %s', candidate => {
  expect(f6DocumentSafetyIssues(`${header}\n${body}`, `${candidate}\n${body}`)).toHaveLength(1);
});

test('explicit English names and labelled names in a mixed header remain protected', () => {
  const source = '**Name**: Alex Chen | Email: owner@example.invalid\n' + body;
  expect(f6DocumentSafetyIssues(source, '# Alex Chen\nowner@example.invalid\n' + body)).toEqual([]);
  expect(f6DocumentSafetyIssues(source, source.replace('Alex Chen', 'Alex Li'))).toHaveLength(1);
  const mixed = '姓名：陈甲 电话：13800138000\n' + body;
  expect(f6DocumentSafetyIssues(mixed, header + '\n' + body)).toHaveLength(1); // new email is not formatting
  expect(f6DocumentSafetyIssues(mixed, '陈甲\n13800138000\n' + body)).toEqual([]);
});

test('selecting portfolio links and changing project prose does not masquerade as identity damage', () => {
  const source = `${header}\n项目链接：https://example.invalid/project\n${body}`;
  expect(f6DocumentSafetyIssues(source, `${header}\n制作退货分类表，供店长每周复盘。`)).toEqual([]);
});

test('adding a phone or email without any original contact value is not a formatting change', () => {
  expect(f6DocumentSafetyIssues(body, body + '\n13800138000')).toHaveLength(1);
  expect(f6DocumentSafetyIssues(body, body + '\nother@example.invalid')).toHaveLength(1);
});

test('Markdown emphasis is not confused with underscores inside an email address', () => {
  const source = '姓名：陈甲\n邮箱：a__b@example.invalid';
  expect(f6DocumentSafetyIssues(source, '__姓名__：__陈甲__\n__邮箱__：__a__b@example.invalid__')).toEqual([]);
  expect(f6DocumentSafetyIssues(source, source.replace('a__b@', 'ab@'))).toHaveLength(1);
});

test('the real F6 write path saves a rewrite that omits a command, but does not save changed contacts', async () => {
  const source = `要更新简历\n${header}\n${body}`;
  const candidate = `${header}\n制作退货分类表，供店长每周复盘。`;
  const input = {resume: source, jd: '', facts: [], answers: [], decisions: [], request: '', scope: 'whole' as const, format: {}};
  const session = new F6ToolSession(input, draft => f6DocumentSafetyIssues(source, draft));
  expect(await session.invoke('write_output', {files: [{name: 'resume-new.md', text: candidate}]}))
    .toMatchObject({saved: ['resume-new.md'], resumeRevision: 1});
  expect(session.deliverables().files['resume-new.md']).toBe(candidate);
  expect(await session.invoke('write_output', {files: [{name: 'resume-new.md', text: candidate.replace('owner@', 'other@')}]}))
    .toMatchObject({saved: [], applied: false});
  expect(session.deliverables().files['resume-new.md']).toBe(candidate);
});
