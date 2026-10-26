import {comparisonDiff, plainResume, parseComparison, parseDraft, COLUMN_IDS} from './resume-comparison';
const id = '1091ba32-5af2-43a7-bf82-af551af83284';
export const sample = {schemaVersion: 'yizhi.resume-comparison/v1', id, title: '虚构同稿', notes: ['仅测试'],
  model: 'deepseek-v4-flash', provider: 'tokendance', input: {resume: '虚构经历', jd: '虚构岗位'},
  columns: COLUMN_IDS.map(id => ({id, label: id, status: '只读', provenance: '测试夹具', sections: [{id: 'opening', label: '开头', text: '虚构经历'}],
    judgments: [], traceIds: [], changeIds: [], runIds: []}))};
test('five immutable sources and the independently saved sixth version are distinct contracts', () => {
  expect(parseComparison(sample)).not.toBeNull();
  expect(parseComparison({...sample, columns: [...sample.columns, sample.columns[0]]})).toBeNull();
  expect(parseComparison({...sample, columns: [...sample.columns].reverse()})).toBeNull();
  expect(parseComparison({...sample, columns: sample.columns.map((c, i) => i ? {...c, sections: [{id: 'other', label: 'x', text: 'x'}]} : c)})).toBeNull();
  expect(parseDraft({opening: ''}, ['opening'])).toEqual({opening: ''});
  expect(parseDraft({opening: 'x', sourceResume: 'overwrite'}, ['opening'])).toBeNull();
});
test.each([['', ''], ['', '新增'], ['删去', ''], ['保留这一段', '保留这一段'],
  ['我做了项目，发现问题。', '我发现问题，再推进项目。'], ['**工作**\n项目', '**实习**\n项目'],
  ['😀\n中文ABC', '😀中文XYZ'], ['a'.repeat(1800), 'b'.repeat(1800)]])('diff round-trip is lossless for %s', (before, after) => {
  const parts = comparisonDiff(before, after);
  expect(parts.filter(p => p.kind !== 'delete').map(p => p.text).join('')).toBe(after);
  expect(parts.filter(p => p.kind !== 'add').map(p => p.text).join('')).toBe(before);
});
test('display strips Markdown delimiters but retains actual readable words and does not execute HTML', () => {
  expect(plainResume('## 标题\n- **负责**[方案](https://example.invalid)')).toBe('标题\n- 负责方案');
  expect(plainResume('<script>unsafe</script>')).toBe('<script>unsafe</script>'); // React text, not HTML.
});
