import type { ResumeChange } from '@/lib/opportunities/types';

const normalize = (value: string) => value.replace(/[\s\p{P}\p{S}]/gu, '')
  // OCR can duplicate a glyph inside the diagnosis. Correcting that glyph is
  // not deleting the failure mechanism. Never collapse negative qualifiers.
  .replace(/([\p{Script=Han}])\1/gu, (pair, char: string) => /[不未无非]/.test(char) ? pair : char);
const failure = /误判|漏判|误报|漏报|不规范|错配|匹配不准|重复识别错误/;

/** Narrow veto: a named failure mechanism explaining the subsequent fix is
 * not generic background. Keep its source wording when simplifying; this does
 * not infer new experience or claim to judge all semantic content loss. */
export function resumeEvidenceRetentionFindings(changes: ResumeChange[]) {
  return changes.flatMap(change => {
    if (!/优化|调整|修复|解决|改进/.test(change.before)) return [];
    const diagnoses = [...change.before.matchAll(/针对([^。；;]{4,100}?)问题/g)]
      .flatMap(match => match[1].split(/[、，,]/))
      .map(normalize).filter(part => part.length >= 4 && part.length <= 32 && failure.test(part));
    const after = normalize(change.after);
    const lost = diagnoses.filter(part => !after.includes(part));
    return lost.length ? [{ changeId: change.id, category: 'quality' as const, severity: 'error' as const,
      message: `精简删掉了解释后续方案取舍的具体失败机制：${lost.join('、')}。保留这些已有问题的简短原意，不以删除诊断冒充贡献优化。`,
    }] : [];
  });
}
