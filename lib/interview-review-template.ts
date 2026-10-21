export type ReviewFieldKey = 'asked' | 'answered' | 'stuck' | 'next';

export interface ReviewField {
  key: ReviewFieldKey;
  question: string;
  hint: string;
  placeholder: string;
  maxLength: number;
}

export type ReviewFields = Record<ReviewFieldKey, string>;

export const REVIEW_FIELD_LIMIT = 400;

export const REVIEW_FIELDS: ReviewField[] = [
  {
    key: 'asked',
    question: '面试官问了什么？',
    hint: '尽量还原原话，包括追问的那一句。',
    placeholder: '例：你说提升了下单转化率，是怎么归因到这次改版的？',
    maxLength: REVIEW_FIELD_LIMIT,
  },
  {
    key: 'answered',
    question: '我当时怎么答的？',
    hint: '记意思就行，不必逐字。答不上来也写「没答上来」。',
    placeholder: '例：说了AB实验的对比口径，但没讲清楚同期还有哪些改动。',
    maxLength: REVIEW_FIELD_LIMIT,
  },
  {
    key: 'stuck',
    question: '哪里卡住了，依据是什么？',
    hint: '写卡住的位置，以及你判断它卡住的证据。',
    placeholder: '例：追问数据来源时停顿，因为当时只看结论，没核对过实验分层。',
    maxLength: REVIEW_FIELD_LIMIT,
  },
  {
    key: 'next',
    question: '下一次怎么答，先练什么？',
    hint: '一条就够，写下次能直接开口的版本。',
    placeholder: '例：先用一句话讲清口径与同期变量，再给数字。',
    maxLength: REVIEW_FIELD_LIMIT,
  },
];

export const EMPTY_REVIEW: ReviewFields = {
  asked: '',
  answered: '',
  stuck: '',
  next: '',
};

export const EXAMPLE_LABEL = '虚构示例';

// 全部为虚构教学材料，不对应任何真实候选人、公司或面试记录。
export const EXAMPLE_REVIEW: ReviewFields = {
  asked:
    '「你说改版后下单转化率有提升，怎么确认是这次改版带来的？」追问：「同期还有别的改动吗？」',
  answered:
    '答了前后两周的转化率对比，也提到做了AB实验；但没有说清实验分流口径，也没提同期上线的优惠券活动。',
  stuck:
    '卡在「怎么排除其他变量」这一句。依据是当时只记住了结论数字，没有回看过实验分层和同期发布记录，所以被追问时只能重复结果。',
  next:
    '先核对实验分流规则和同期发布记录，确认后再说明能否归因；如果没有随机分组，只陈述上线前后的变化，不把相关性说成因果。',
};

export function hasInput(fields: ReviewFields): boolean {
  return REVIEW_FIELDS.some(({ key }) => fields[key].trim().length > 0);
}

export function filledCount(fields: ReviewFields): number {
  return REVIEW_FIELDS.filter(({ key }) => fields[key].trim().length > 0).length;
}

export function remainingLength(value: string, maxLength: number): number {
  return Math.max(0, maxLength - value.length);
}

export const REVIEW_TEXT_HEADER = '益职AI 面试复盘清单';
export const REVIEW_TEXT_NOTE = '只在当前页面填写，未上传、未保存到账号。';

export function buildReviewText(fields: ReviewFields, example: boolean): string {
  const lines = [REVIEW_TEXT_HEADER];
  if (example) lines.push(`内容来源：${EXAMPLE_LABEL}`);
  lines.push(REVIEW_TEXT_NOTE, '');
  REVIEW_FIELDS.forEach(({ key, question }, index) => {
    const value = fields[key].trim();
    lines.push(`${index + 1}. ${question}`);
    lines.push(value.length > 0 ? value : '（空）', '');
  });
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function reviewFileName(example: boolean): string {
  return example ? '益职-面试复盘-虚构示例.txt' : '益职-面试复盘.txt';
}
