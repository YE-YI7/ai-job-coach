import {bindEditorialReferences, evidenceEditorTools} from './resume-evidence-tools';
test('原生引用不接受未读编号或模型伪造quote；服务器绑定完整原文含限定', () => {
  const facts = '[known] 协助完成原型，没有上线。';
  expect(bindEditorialReferences({decisions: [{evidence: [{sourceId: 'known'}]}]}, facts)[0].sourceText)
    .toBe('协助完成原型，没有上线。');
  expect(() => bindEditorialReferences({decisions: [{evidence: [{sourceId: 'unread'}]}]}, facts)).toThrow();
  expect(() => bindEditorialReferences({decisions: [{evidence: [{sourceId: 'known', quote: '独立上线'}]}]}, facts)).toThrow();
});
test('本轮只开放无歧义的查找/读取；不是六个重叠接口，也不强制读取', () => {
  const tools = evidenceEditorTools({facts: '[source] 原文', memoryEnabled: true, loaded: false, index: [{id: 'm', revision: 'r'}]});
  expect(tools.map(t => t.function.name)).toEqual(['memory_find', 'context_load', 'submit_edit']);
  expect(tools.find(t => t.function.name === 'submit_edit')).toBeDefined();
});
