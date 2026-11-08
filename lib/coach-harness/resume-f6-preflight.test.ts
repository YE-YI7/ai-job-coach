import {f6DocumentPreflight} from './resume-f6-preflight';

test('carried-over source style does not block a real edit elsewhere',()=>{
  const old='2025年11月提出提醒机制的重要性。\n';
  expect(f6DocumentPreflight(old+'整理记录，整理后交给同事。',old+'整理记录，交给同事。')).toEqual([]);
});

test.each([
  ['负责整理评测记录。','主导评测并提升正确率。'],
  ['计划上线平台。','上线平台。'],
  ['评测正确率提升6.4个百分点。','评测正确率6.4个百分点。'],
  ['姓名：测试用户\n邮箱：owner@example.invalid\n负责整理记录。',
    '姓名：测试用户\n邮箱：another@example.invalid\n整理记录。'],
])('preflight keeps factual, maturity, metric and identity blocks', (source,candidate)=>{
  expect(f6DocumentPreflight(source,candidate).length).toBeGreaterThan(0);
});

test('instructions cannot be substituted for factual supplements',()=>{
  expect(f6DocumentPreflight('负责整理记录。','迭代产品。')).not.toEqual([]);
});
