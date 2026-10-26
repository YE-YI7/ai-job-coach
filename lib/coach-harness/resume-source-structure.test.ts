import { resumeLeadIn, resumeSourceParagraphs } from './resume-source-structure';

test('plain and bold lead-ins are structure; URLs and clock values are not', () => {
  expect(resumeLeadIn('需求分析、原型设计：访谈业务人员，输出原型。')?.style).toBe('plain');
  expect(resumeLeadIn('- **业务流程。** 分析业务台账。')?.style).toBe('bold');
  expect(resumeLeadIn('https://example.invalid')).toBeNull();
  expect(resumeLeadIn('09:30')).toBeNull();
});

test('OCR continuation stays one exact source span, never joined across entry boundaries', () => {
  const paragraph = '业务抽象与流程设计:针对台账格式不统一的问题，分析三张业务台账，\r\n提炼十二项字段，设计人工复核流程，输出PRD与原型。';
  const next = '效果评测:通过离线对照检查误判，保留复核环节。';
  const source = `实习经历\r\n测试研究院\r\n2026.01-至今\r\n${paragraph}\r\n${next}\r\n项目经历\r\n虚构项目\r\n`;
  const spans = resumeSourceParagraphs(source);
  expect(spans).toContain(paragraph);
  expect(spans).toContain(next);
  expect(spans.every(span => source.includes(span))).toBe(true);
  expect(spans).not.toContain(`${paragraph}\r\n${next}`);
});

test('blank lines, separate bullets and short entry headings stay separate', () => {
  expect(resumeSourceParagraphs('第一段较长的原文内容\n\n第二段较长的原文内容')).toHaveLength(2);
  expect(resumeSourceParagraphs('- **需求整理。** 收集反馈。\n- **交付验证。** 检查文件。')).toHaveLength(2);
});

test('a body colon inside an OCR continuation does not become a false paragraph heading', () => {
  const text = '知识工作台：针对内部知识维护复杂且检索困难的问题，参与设计可视化工作台，支\r\n'
    + '持业务人员自主维护知识库与查询依据:建立离线评测，检查依据匹配和回答质量。';
  expect(resumeSourceParagraphs(text)).toEqual([text]);
  expect(resumeLeadIn('持业务人员自主维护知识库与查询依据:建立离线评测。')).toBeNull();
});
