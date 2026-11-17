import {createHash} from 'node:crypto';
import type {LlmMessage} from '@/lib/llm-tools';
import type {F6MentorGuidance} from './f6-mentor-guidance';

/** The current generation cannot receive another user turn. Re-present its
 * own guidance as unanswered AI communication, not inferred personal facts.
 * No question extraction, answer classifier, approval gate, or extra call. */
export function f6ParallelCoachingHandoff(guidance?: F6MentorGuidance): LlmMessage[] {
  const state = {
    source: 'host_parallel_coaching',
    userReplySinceGenerationStarted: 'none_received',
    initialUserMaterialsRemainAvailable: true,
    guidance: guidance ? {
      source: 'author_generated_user_message_not_candidate_evidence',
      resumeRevision: guidance.resumeRevision,
      currentForDraft: guidance.current,
      sha256: createHash('sha256').update(guidance.text).digest('hex'),
    } : null,
  };
  const messages: LlmMessage[] = [
    {role: 'user', content: JSON.stringify(state)},
    {role: 'user', content: '改稿与补问并行：继续交付已有材料能支撑的完整稿，不等待用户回复。'
      + '首请求中的本人回答仍有效，但本次生成开始后没有收到新的本人回答。'
      + '下方是你给用户的沟通，不是用户回答，也不是新增事实。'
      + '未答的问题保持未确认；既不自行补答案，也不把未答当否认、据此削弱原稿已有贡献。'
      + '可改好其他部分、保留原有证据强度，同时在右侧继续一个有价值的问题。'
      + (guidance ? '' : '\n\n本轮尚未保存导师消息；有关键缺口时可与正文同次交付，不为走流程强问。')},
  ];
  if (guidance) messages.push({role: 'assistant', content: JSON.stringify({
    ...state.guidance, document: 'mentor.md', text: guidance.text,
  })});
  return messages;
}
