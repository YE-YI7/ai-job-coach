import {
  EXAMPLE_REVIEW,
  EMPTY_REVIEW,
  REVIEW_FIELDS,
  REVIEW_FIELD_LIMIT,
  buildReviewText,
  filledCount,
  hasInput,
  remainingLength,
  reviewFileName,
} from './interview-review-template';

describe('面试复盘模板', () => {
  it('只有约定的四个问题，且每个都有长度上限', () => {
    expect(REVIEW_FIELDS.map((field) => field.key)).toEqual([
      'asked',
      'answered',
      'stuck',
      'next',
    ]);
    REVIEW_FIELDS.forEach((field) => {
      expect(field.maxLength).toBe(REVIEW_FIELD_LIMIT);
      expect(field.question.length).toBeGreaterThan(0);
      expect(field.hint.length).toBeGreaterThan(0);
    });
  });

  it('默认是空白模板，没有任何预填内容', () => {
    expect(hasInput(EMPTY_REVIEW)).toBe(false);
    expect(filledCount(EMPTY_REVIEW)).toBe(0);
    REVIEW_FIELDS.forEach(({ key }) => expect(EMPTY_REVIEW[key]).toBe(''));
  });

  it('下载的文本与屏幕上输入的内容一致，并保留换行', () => {
    const fields = {
      ...EMPTY_REVIEW,
      asked: '问了什么\n第二行原话',
      next: '  下一次先练口径  ',
    };
    const text = buildReviewText(fields, false);
    expect(text).toContain('问了什么\n第二行原话');
    expect(text).toContain('下一次先练口径');
    expect(text).not.toContain('  下一次先练口径  ');
    expect(text.endsWith('\n')).toBe(true);
    // 四个问题按顺序出现，空字段明确标为（空）
    const positions = REVIEW_FIELDS.map((field) => text.indexOf(field.question));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(text.match(/（空）/g)).toHaveLength(2);
  });

  it('示例文本标明是虚构示例，文件不是 PDF', () => {
    const text = buildReviewText(EXAMPLE_REVIEW, true);
    expect(text).toContain('虚构示例');
    expect(reviewFileName(true)).toBe('益职-面试复盘-虚构示例.txt');
    expect(reviewFileName(false)).toBe('益职-面试复盘.txt');
    expect(reviewFileName(false)).toMatch(/\.txt$/);
    expect(reviewFileName(false)).not.toMatch(/\.pdf$/i);
  });

  it('示例与说明文本里没有可识别的个人联系方式', () => {
    const haystacks = [
      buildReviewText(EXAMPLE_REVIEW, true),
      ...REVIEW_FIELDS.flatMap((field) => [field.question, field.hint, field.placeholder]),
    ].join('\n');
    expect(haystacks).not.toMatch(/1[3-9]\d{9}/); // 手机号
    expect(haystacks).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i); // 邮箱
    expect(haystacks).not.toMatch(/\d{7,}/); // 长数字串（证件/电话）
    expect(haystacks).not.toContain('身份证');
  });

  it('剩余字数不会出现负数', () => {
    expect(remainingLength('', REVIEW_FIELD_LIMIT)).toBe(REVIEW_FIELD_LIMIT);
    expect(remainingLength('x'.repeat(REVIEW_FIELD_LIMIT), REVIEW_FIELD_LIMIT)).toBe(0);
    expect(remainingLength('x'.repeat(REVIEW_FIELD_LIMIT + 50), REVIEW_FIELD_LIMIT)).toBe(0);
  });
});
