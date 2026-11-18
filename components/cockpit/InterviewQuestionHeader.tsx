import type { CSSProperties } from "react";

/** A visual question introduction, not an audio playback or online-presence indicator. */
export default function InterviewQuestionHeader({ round, index, total }: {
  round: string;
  index: number;
  total: number;
}) {
  return <header data-question-presence>
    <div data-interviewer-identity>
      <span data-interviewer-emblem aria-hidden="true">
        {[0, 1, 2, 3, 4].map(bar => <i key={bar} style={{ "--bar": bar } as CSSProperties} />)}
      </span>
      <div><span data-interviewer-name>益职面试官</span><span data-interviewer-context>{round} · 这一题，听听你的想法</span></div>
    </div>
    <span data-question-counter aria-label={`第 ${index + 1} 题，共 ${total} 题`}>
      <b>{String(index + 1).padStart(2, "0")}</b><span> / {String(total).padStart(2, "0")}</span>
    </span>
  </header>;
}
