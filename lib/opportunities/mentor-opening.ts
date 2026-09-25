import type { Opportunity } from "./types";

/** A free, deterministic welcome, not a fabricated model turn or a saved user message. */
export function mentorOpening(item: Opportunity) {
  if (!item.resumeText) return { text: "先不用填一堆信息。上传简历后，我可以结合你的经历，帮你判断岗位、改简历或练面试。没有简历也可以从经历开始。", prompts: ["我还没有简历，请一次问我一个问题，帮我整理经历", "我想先明确求职方向，请帮我缩小范围"] };
  if (!item.jdText) return { text: "你的简历已经在这里了。接下来可以先明确想找的岗位，或者拿一个招聘链接来一起判断，不必重复讲经历。", prompts: ["结合我的简历，帮我选适合搜索的岗位方向；不要编造正在招聘的职位", "先帮我准备面试，从简历中最值得追问的一段开始"] };
  if (item.applicationQuality?.status === "blocked") return { text: "简历检查还没通过，但不需要从头再来。我们先处理第一处问题；不想采用的建议，可以保留原文。", prompts: ["请解释这份简历的第一处检查问题，带我具体修改，不要重复列所有问题", "请帮我区分哪些建议值得采用，哪些应保留原文"] };
  return { text: "岗位和简历都有了。你可以直接让我带着做，不必先研究工具；我们一次处理一个真正影响投递的问题。", prompts: ["结合这个岗位和我的简历，先告诉我最值得改的一处，并带我改好", "围绕这个岗位帮我练一道面试题，先讲考察点，再等我回答"] };
}
