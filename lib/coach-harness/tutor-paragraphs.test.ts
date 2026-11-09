import type {Root, Paragraph} from 'mdast';
import {remarkTutorParagraphs} from './tutor-paragraphs';

const sentence='这里说明具体改动与待核实的依据，保留原始材料中的判断和事实，不添加新的经历。';
const text=(node:unknown):string=>{
  const n=node as {value?:string;children?:unknown[]};
  return n.value||n.children?.map(text).join('')||'';
};
test('long prose in a Markdown list gains readable paragraphs without losing emphasis or content',()=>{
  const paragraph:Paragraph={type:'paragraph',children:[{type:'strong',children:[{type:'text',value:'先核对责任范围。'}]},
    {type:'text',value:sentence.repeat(12)},{type:'link',url:'https://example.test',children:[{type:'text',value:'查看依据'}]}]};
  const root:Root={type:'root',children:[{type:'list',ordered:true,children:[{type:'listItem',children:[paragraph]}]}]};
  const before=text(root);remarkTutorParagraphs()(root);
  const list=root.children[0];if(list.type!=='list')throw Error('list lost');
  expect(list.children[0].children.length).toBeGreaterThan(3);
  expect(text(root)).toBe(before);
  expect(JSON.stringify(root)).toContain('https://example.test');
  expect(JSON.stringify(root)).toContain('"strong"');
});
test('short prose, code, table cells and inline code retain their structure',()=>{
  const root:Root={type:'root',children:[{type:'paragraph',children:[{type:'text',value:'只问一个具体问题。'}]},
    {type:'code',lang:'text',value:sentence.repeat(12)},
    {type:'paragraph',children:[{type:'inlineCode',value:sentence.repeat(12)}]}]};
  const before=JSON.stringify(root);remarkTutorParagraphs()(root);expect(JSON.stringify(root)).toBe(before);
});
