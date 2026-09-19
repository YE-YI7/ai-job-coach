import {
  analyzeResumeGap,
  normalizeText,
  type GapReport,
} from './matcher';

/* ============================
   确定性样例：后端岗 JD + 一份偏弱的简历
   ============================ */

const SAMPLE_JD = [
  '岗位：后端开发工程师（上海）',
  '要求：',
  '1. 3年以上工作经验，熟悉 Java、MySQL、Redis，了解 Kafka 或消息队列；',
  '2. 本科及以上学历，英语四级以上，具备良好的沟通能力；',
  '3. 有分布式、高并发经验者优先；熟悉 Spring Boot 优先。',
].join('\n');

const SAMPLE_RESUME = [
  '2年开发经验，熟悉 Java、MySQL、Redis。',
  '- 负责订单模块的接口开发与维护',
  '- 参与商品服务的重构，接口平均耗时下降 40%',
  '本科，英语四级，现居上海，沟通能力强',
].join('\n');

function run(resumeText: string, jdText: string): GapReport {
  return analyzeResumeGap({ resumeText, jdText });
}

function hit(report: GapReport, term: string) {
  return report.matched.find((m) => m.term.toLowerCase() === term.toLowerCase());
}

describe('normalizeText / 规范化', () => {
  it('小写化、去空白、全角转半角', () => {
    expect(normalizeText('  Java  Script ')).toBe('javascript');
    expect(normalizeText('Ｊａｖａ　４'))
      .toBe('java4');
    expect(normalizeText('REDIS\n')).toBe('redis');
  });

  it('非字符串输入安全', () => {
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(123)).toBe('');
  });
});

describe('analyzeResumeGap / 关键词对照', () => {
  const report = run(SAMPLE_RESUME, SAMPLE_JD);

  it('JD 词典关键词被抽出，命中与否分别标注', () => {
    expect(hit(report, 'Java')).toBeDefined();
    expect(hit(report, 'Java')?.inResume).toBe(true);
    expect(hit(report, 'MySQL')?.inResume).toBe(true);
    expect(hit(report, 'Kafka')).toBeDefined();
    expect(hit(report, 'Kafka')?.inResume).toBe(false);
  });

  it('missing 收录 JD 出现、简历未命中的词', () => {
    expect(report.missing).toContain('Kafka');
    expect(report.missing).toContain('Spring Boot');
    expect(report.missing).toContain('分布式');
    expect(report.missing).toContain('高并发');
    expect(report.missing).not.toContain('MySQL');
  });

  it('js ↔ javascript、大小写经别名归一后命中', () => {
    const r = run('写过 JS 和 TypeScript 项目', '岗位要求：熟悉 JavaScript / TypeScript');
    expect(hit(r, 'JavaScript')?.inResume).toBe(true);
    expect(hit(r, 'TypeScript')?.inResume).toBe(true);
  });

  it('summary 计数自洽', () => {
    expect(report.summary.jdKeywordCount).toBe(report.matched.length);
    expect(report.summary.missingCount).toBe(report.missing.length);
    expect(report.summary.matchedCount).toBe(
      report.matched.filter((m) => m.inResume).length,
    );
    expect(report.summary.matchedCount + report.summary.missingCount).toBe(
      report.summary.jdKeywordCount,
    );
  });
});

describe('analyzeResumeGap / 硬门槛', () => {
  const report = run(SAMPLE_RESUME, SAMPLE_JD);
  const byLabel = (kw: string) =>
    report.hardRequirements.find((h) => h.label.includes(kw));

  it('抽出经验年限，并按简历年限判定满足与否', () => {
    const exp = byLabel('工作经验');
    expect(exp).toBeDefined();
    expect(exp?.label).toBe('工作经验：≥ 3 年');
    expect(exp?.satisfied).toBe(false); // 简历只有 2 年
    expect(exp?.jdEvidence).toContain('3年以上工作经验');
  });

  it('经验足够时判为满足', () => {
    const r = run('5年工作经验，Java 后端', SAMPLE_JD);
    expect(r.hardRequirements.find((h) => h.label.includes('工作经验'))?.satisfied).toBe(true);
  });

  it('中文数字与区间写法都能抽（三年 → 3；2-4年 → 取上限 4）', () => {
    const r1 = run('2年开发经验', '三年以上相关工作经验');
    expect(r1.hardRequirements.find((h) => h.label.includes('工作经验'))?.label).toBe('工作经验：≥ 3 年');
    const r2 = run('3年开发经验', '工作经验 2-4 年');
    expect(r2.hardRequirements.find((h) => h.label.includes('工作经验'))?.label).toBe('工作经验：≥ 4 年');
    expect(r2.hardRequirements.find((h) => h.label.includes('工作经验'))?.satisfied).toBe(false);
  });

  it('抽出学历/语言/地点，简历有词面证据则满足', () => {
    expect(byLabel('学历')?.label).toBe('学历：本科及以上');
    expect(byLabel('学历')?.satisfied).toBe(true);
    expect(byLabel('英语')?.satisfied).toBe(true);
    expect(byLabel('工作地点')?.satisfied).toBe(true);
  });

  it('简历缺证据时判为未满足（存疑），summary.hardUnmet 计入', () => {
    const r = run('熟悉 Java', '3年以上经验，本科及以上学历，英语流利，工作地北京');
    const unmet = r.hardRequirements.filter((h) => !h.satisfied);
    expect(unmet.length).toBeGreaterThanOrEqual(3);
    expect(r.summary.hardUnmet).toBe(unmet.length);
    expect(r.hardRequirements.find((h) => h.label.includes('英语'))?.jdEvidence.length).toBeGreaterThan(0);
  });

  it('实习时长类硬门槛会被抽出', () => {
    const r = run('熟悉 Python', '招聘实习生：每周实习4天，持续6个月以上，可尽快到岗');
    const intern = r.hardRequirements.find((h) => h.label.includes('实习/到岗'));
    expect(intern).toBeDefined();
    expect(intern?.satisfied).toBe(false);
    expect(intern?.jdEvidence).toContain('每周');
  });
});

describe('analyzeResumeGap / 疑似缺量化证据', () => {
  const report = run(SAMPLE_RESUME, SAMPLE_JD);

  it('抓到动词开头且无数字的条目，带数字的不抓', () => {
    expect(report.weakQuantification.some((s) => s.includes('负责订单模块'))).toBe(true);
    expect(report.weakQuantification.some((s) => s.includes('商品服务'))).toBe(false);
  });

  it('每条截断 ≤60 字', () => {
    const longLine = `负责${'一个非常长的项目描述'.repeat(10)}`;
    const r = run(longLine, 'Java');
    expect(r.weakQuantification.length).toBe(1);
    expect(r.weakQuantification[0].length).toBeLessThanOrEqual(60);
  });
});

describe('analyzeResumeGap / 边界与健壮性', () => {
  it('空 JD / 空简历 / 双空都不崩，给出对应空结果', () => {
    const empty = run('', '');
    expect(empty.matched).toEqual([]);
    expect(empty.missing).toEqual([]);
    expect(empty.hardRequirements).toEqual([]);
    expect(empty.weakQuantification).toEqual([]);
    expect(empty.summary).toEqual({
      jdKeywordCount: 0,
      matchedCount: 0,
      missingCount: 0,
      hardUnmet: 0,
    });

    const noResume = run('', SAMPLE_JD);
    expect(noResume.summary.matchedCount).toBe(0);
    expect(noResume.summary.missingCount).toBe(noResume.matched.length);
    expect(noResume.weakQuantification).toEqual([]);

    const noJd = run(SAMPLE_RESUME, '');
    expect(noJd.matched).toEqual([]);
    expect(noJd.hardRequirements).toEqual([]);
  });

  it('缺字段/非字符串输入安全', () => {
    const r = analyzeResumeGap({} as { resumeText: string; jdText: string });
    expect(r.summary.jdKeywordCount).toBe(0);
    const r2 = analyzeResumeGap({
      resumeText: undefined as unknown as string,
      jdText: SAMPLE_JD,
    });
    expect(r2.matched.length).toBeGreaterThan(0);
  });

  it('超长输入被裁剪，不抛异常', () => {
    const huge = 'a'.repeat(100000);
    const r = run(huge, huge);
    expect(Array.isArray(r.matched)).toBe(true);
  });

  it('确定性：同样输入两次运行结果一致', () => {
    expect(JSON.stringify(run(SAMPLE_RESUME, SAMPLE_JD))).toBe(
      JSON.stringify(run(SAMPLE_RESUME, SAMPLE_JD)),
    );
  });
});
