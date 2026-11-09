'use client';
import TutorMarkdown from './TutorMarkdown';
import styles from './ResumeAgentConversation.module.css';

/** Layout by Markdown headings only; never grade or rewrite model content. */
export function tutorReportSections(text: string) {
  const sections: {title: string; body: string}[] = [];
  let introduction = '', current: typeof sections[number] | undefined, fence = '';
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) fence = fence && marker[1][0] === fence[0] && marker[1].length >= fence.length ? '' : fence || marker[1];
    const heading = !fence && line.match(/^#{2,3} +(.+?)\s*$/);
    if (heading) {
      current = {title: heading[1], body: line}; sections.push(current);
    } else if (current) current.body += line;
    else introduction += line;
  }
  return {introduction, sections};
}

export default function TutorReport({children}: {children: string}) {
  const {introduction, sections} = tutorReportSections(children);
  return <>
    {introduction.trim() && <TutorMarkdown className={styles.reply}>{introduction}</TutorMarkdown>}
    {sections.map((section, index) => <details className={styles.reportSection} key={index}>
      <summary>{section.title}</summary>
      <TutorMarkdown className={styles.reply}>{section.body.replace(/^#{2,3} +[^\n]*\n?/, '')}</TutorMarkdown>
    </details>)}
  </>;
}
