import {tutorInvitation} from "./tutor-invitation";
import type {InterviewPracticeFeedback} from "@/lib/opportunities/types";
test("no invitation without saved gaps",()=>{expect(tutorInvitation()).toBeNull();expect(tutorInvitation({gaps:[]} as unknown as InterviewPracticeFeedback)).toBeNull();});
test("invitation carries the saved question and answer, never auto-scores",()=>{
 const result=tutorInvitation({id:"saved-1",question:"如何评测？",answer:"我只做过人工抽检",gaps:["缺少评测方法"]} as InterviewPracticeFeedback)!;
 expect(result.id).toBe("saved-1");expect(result.text).toContain("缺少评测方法");expect(result.prompt).toContain("我只做过人工抽检");expect(result.prompt).toContain("不要先评分");
});
