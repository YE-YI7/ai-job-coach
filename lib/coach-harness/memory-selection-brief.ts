import 'server-only';

export const MEMORY_SELECTION_BRIEF_VERSION = 'memory-selection-brief/v0.1-M04b';
export const MEMORY_SELECTION_BRIEF = `选材职责：先看原稿哪些表述只有工具名、笼统动作或结果，缺少具体贡献，再决定需要回读哪些证据。
优先寻找能解释“具体发生了什么问题—本人如何判断或选择—实际改变了什么”的原文，不能仅按标题/栏目各选一块凑齐主题。角色边界、否定与未知也按需保留。
不是所有资料都要用，也不要求每条有数字；若不相关可不选。不得补造判断/责任/因果，实际用到的证据必须完整回读。
工具前提：预览不等于完整正文；新会话的semantic ID须先memory.recall，再context.load，可以同批按此前后执行。只有自己选中且装载成功的资料才可ready。`;

export function contributionSelectionInstruction(editingRequest: string) {
  return '为后续原编辑准备已有证据，不写简历。原编辑任务：' + editingRequest + '\n' + MEMORY_SELECTION_BRIEF;
}
