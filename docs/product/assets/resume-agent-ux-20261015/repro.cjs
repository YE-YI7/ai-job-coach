// Read-only reproduction. Run from the product root: node docs/product/assets/resume-agent-ux-20261015/repro.cjs
// Audited baseline: 21fb4e81a07c6fd27d14493dd78aa0bfbe0845bc. Output is evidence, not a passing regression suite.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const cache = new Map();
function load(file) {
  const full = path.resolve(root, file);
  if (cache.has(full)) return cache.get(full);
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(full, module.exports);
  const localRequire = id => id.startsWith('.')
    ? load(path.relative(root, path.resolve(path.dirname(full), id + '.ts')))
    : require(id);
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}
const { mergeResumeAgentChanges } = load('lib/opportunities/resume-agent-merge.ts');
const original = '参与校园二手平台，整理同学反馈并交给负责人。';
const accepted = { id: 'accepted', before: original, after: '整理校园二手平台反馈，交给负责人。', status: 'accepted', section: '项目', reason: '精简', evidenceId: null };
const proposal = { ...accepted, id: 'after-answer', status: 'pending', after: '整理校园二手平台反馈，交付分类问题清单给负责人。', evidenceIds: ['new-answer'] };
const merged = mergeResumeAgentChanges(original, [accepted], [proposal]);
console.log(JSON.stringify({ case: 'accepted_anchor_followup', retained: merged.map(x => x.id), newSupplementVisible: merged.some(x => x.after.includes('分类问题清单')) }));
const source = fs.readFileSync(path.join(root, 'app/api/coach/resume-draft/route.ts'), 'utf8');
const begin = source.indexOf('const coversSupplement =');
const end = source.indexOf('for(let attempt=', begin);
if (begin < 0 || end < begin) throw Error('Implementation changed; inspect the new gate rather than reusing this extraction.');
const expression = source.slice(begin, end).replace('const coversSupplement =', 'return ').replace('(proposals:ResumeChange[])', '(proposals)');
const oldAnswer = { sourceExcerpt: '旧项目：整理活动反馈', claimId: 'old-claim' };
const newestAnswer = { sourceExcerpt: '新项目：维护商品表格', claimId: 'new-claim' };
const covers = new Function('usefulAnswers', expression)([oldAnswer, newestAnswer]);
console.log(JSON.stringify({ case: 'latest_answer_not_covered', currentGatePasses: covers([{ before: oldAnswer.sourceExcerpt, evidenceIds: ['old-claim'] }]), newestAnswerIncluded: false }));
const { nextResumeQuestion } = load('lib/coach-harness/resume-task-types.ts');
const compound = '当时要解决什么问题，你做了什么，最后交付了什么？';
console.log(JSON.stringify({ case: 'multi_fact_single_question_mark', accepted: Boolean(nextResumeQuestion(original, { sourceExcerpt: original, field: 'action', question: compound }, [])), question: compound }));
