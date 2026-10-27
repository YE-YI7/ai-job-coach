import {formatRawProjectHeading} from './resume-project-layout';
import {resumeNumberTokens} from './resume-number-tokens';
import {resumePrintHtml} from '@/lib/resume-print';
test('only separates an explicit trailing date range, without changing words, values or order',()=>{
  const source='示例项目｜需求与验收｜2025.11 – 至今\n实际项目正文。';
  const result=formatRawProjectHeading(source);
  expect(result).toBe('### 示例项目｜需求与验收\n2025.11 – 至今\n实际项目正文。');
  expect(resumeNumberTokens(result)).toEqual(resumeNumberTokens(source));
  expect(result.replace(/[\s|｜#]/g,'')).toBe(source.replace(/[\s|｜#]/g,''));
  expect(formatRawProjectHeading(result)).toBe(result);
});
test('the real print renderer keeps the explicit project date ahead of the introduction',()=>{
  const output=formatRawProjectHeading('示例项目｜需求与验收｜2025.11 – 至今\n项目介绍和方向。\n• 贡献一。');
  const html=resumePrintHtml(output,'editorial','隔离验收',{toolbar:false});
  expect(html).toContain('<h3 class="resume-entry">');
  expect(html.indexOf('2025.11 – 至今')).toBeLessThan(html.indexOf('项目介绍和方向。'));
  expect(html.match(/2025\.11 – 至今/g)).toHaveLength(1);
});
test.each(['项目｜2025.11','项目｜联系人 13800000000','项目｜时间待确认','项目\n2025.11 – 至今'])('does not infer a missing date or touch ordinary text: %s',text=>{
  expect(formatRawProjectHeading(text)).toBe(text);
});
