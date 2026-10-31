import {nativeToolEnvelope, type NativeTool} from './llm-tools';
const tools: NativeTool[] = [{type: 'function', function: {name: 'context_load', description: 'read', parameters: {type: 'object'}}}];
test('工具调用没有正文也不是空响应；真实ID和参数原样保留', () => {
  const calls = [{id: 'c1', type: 'function', function: {name: 'context_load', arguments: '{"id":"one","revision":"r1"}'}}];
  expect(JSON.parse(nativeToolEnvelope({content: null, tool_calls: calls}, 'tool_calls', tools)).tool_calls).toEqual(calls);
});
test('截断、未知工具和重复ID不变造为正常工具调用', () => {
  expect(() => nativeToolEnvelope({content: '{"type":"actions"}'}, 'length', tools)).toThrow();
  expect(() => nativeToolEnvelope({tool_calls: [{id: 'a', type: 'function', function: {name: 'write', arguments: '{}'}}]}, 'tool_calls', tools)).toThrow();
  expect(() => nativeToolEnvelope({tool_calls: [{id: 'a', type: 'function', function: {name: 'context_load', arguments: '[]'}}]}, 'tool_calls', tools)).toThrow();
});
