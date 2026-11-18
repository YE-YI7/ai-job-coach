/** Reading-only formatting. Original text remains the source for speech and assessment. */
export function questionReadingSegments(question: string): string[] {
  if (question.length < 110) return [question];
  const segments: string[] = [];
  let start = 0;
  for (let index = 0; index < question.length; index += 1) {
    if (!/[。！？\n]/u.test(question[index])) continue;
    while (/[”’」』）】]/u.test(question[index + 1] || " ")) index += 1;
    const end = index + 1;
    if (end - start < 55 || question.length - end < 25 || segments.length >= 2) continue;
    segments.push(question.slice(start, end));
    start = end;
  }
  segments.push(question.slice(start));
  return segments;
}

export default function InterviewQuestionText({ question }: { question: string }) {
  const segments = questionReadingSegments(question);
  return <h3 data-question-length={question.length >= 110 ? "long" : "short"}>
    {segments.map((segment, index) => <span data-question-paragraph key={index}>{segment}</span>)}
  </h3>;
}
