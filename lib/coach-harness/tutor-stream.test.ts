import {createTutorStream,unwrapTutorAnswer} from "./tutor-stream";
test("ordinary answers stream complete checked sentences before completion",()=>{
 const emit=jest.fn(),push=createTutorStream("教我概念",emit);
 push("<ans");push("wer>第一句。");expect(emit).toHaveBeenLastCalledWith("第一句。");
 push("你已经掌");expect(emit).toHaveBeenCalledTimes(1);
 push("握了。\n");expect(emit.mock.calls.at(-1)[0]).toContain("（待你确认）");
 push('</answer><followups>["请继续"]');expect(emit.mock.calls.at(-1)[0]).not.toContain("followups");
});
test("blocking and legacy text cannot bypass final checks",()=>{
 const emit=jest.fn();createTutorStream("",emit)('<clarify level="blocking">缺什么？</clarify>胡说。');
 createTutorStream("",emit)("旧协议回答。");expect(emit).not.toHaveBeenCalled();
});
test("long exact repetition stops generation, normal short repetition is allowed",()=>{
 const push=createTutorStream("",()=>{});const repeated="这是一段反复重新开头而没有继续解释概念的文字，需要阻止模型一直不停地重复输出同样的内容。";
 expect(()=>push("<answer>"+repeated.repeat(3))).toThrow("输出重复");
 expect(()=>createTutorStream("",()=>{})("<answer>好。好。好。")).not.toThrow();
});
test("removes only the protocol envelope",()=>expect(unwrapTutorAnswer('<answer>正文。</answer><followups>[]</followups>')).toBe('正文。<followups>[]</followups>'));
