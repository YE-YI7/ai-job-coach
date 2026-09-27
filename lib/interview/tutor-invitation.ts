import type {InterviewPracticeFeedback} from "@/lib/opportunities/types";
import {learningHandoff} from "./learning-handoff";

/** A saved assessment can invite learning, but cannot spend another model call. */
export function tutorInvitation(record?: InterviewPracticeFeedback) {
  const gap = record?.gaps?.find(value => value.trim());
  if (!record || !gap) return null;
  return {
    id: record.id,
    text: `刚才这题还有一处可以一起练：「${gap.slice(0,120)}」。我可以先讲一个例子，再陪你重新答。`,
    ...learningHandoff(record.question, `我想练习这道题。上次回答：${record.answer.slice(0,700)}。点评提示（待核实，不代表能力事实）：${gap.slice(0,200)}`),
  };
}
