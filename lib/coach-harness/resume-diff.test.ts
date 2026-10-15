import { isTrivialRewrite } from "./resume-diff";

describe("useful factual restructuring", () => {
  it('rejects explanatory padding that makes an already clear bullet longer',()=>{
    expect(isTrivialRewrite('编写 12 个组件测试，覆盖表单校验与加载失败，提交同学复核。','编写 12 个组件测试用例，覆盖表单校验、加载失败两类场景，提交同学复核。')).toBe(true);
    expect(isTrivialRewrite('编写组件测试，覆盖表单校验，提交同学复核。','编写 12 个组件测试，覆盖表单校验与加载失败，提交同学复核。')).toBe(false);
  });
  it('rejects action-verb swaps around the same already explicit page deliverables',()=>expect(isTrivialRewrite('使用 React 和 TypeScript 完成图书列表与预约表单两个页面，目前是课程原型。','基于 React 和 TypeScript 开发图书列表页、预约表单页，为课程项目原型')).toBe(true));
  it('does not count handoff synonyms as better action logic',()=>expect(isTrivialRewrite('核对活动页面的图片与标题，记录差异并交给页面同事修改。','核对活动页面的图片与标题，记录差异后移交页面同事修改。')).toBe(true));
  it('rejects minor embellishment of already clear short bullets',()=>{
    expect(isTrivialRewrite('整理每日退换货问题，将待处理清单交给客服主管跟进。','整理每日退换货问题，生成待处理清单并交付客服主管跟进')).toBe(true);
    expect(isTrivialRewrite('核对活动页面的图片与标题，记录差异并交给页面同事修改。','核对活动页面图片与标题，记录差异后交付页面同事修改')).toBe(true);
  });
  it('keeps substantial factual shortening eligible',()=>expect(isTrivialRewrite('平时主要负责店铺商品资料相关的整理工作，工作内容包括核对活动价格、更新商品资料表格，然后把整理好的表格交给运营同事使用。','核对店铺活动价格，更新商品资料表格，整理后同步给运营同事使用')).toBe(false));
  it("allows a dense factual paragraph to become readable bullets", () => {
    expect(isTrivialRewrite("负责客户咨询，记录退款问题。整理问题清单，交给主管处理。", "- 负责客户咨询，记录退款问题。\n- 整理问题清单，交给主管处理。")).toBe(false);
  });
  it("still rejects whitespace-only changes and existing bullet reformatting", () => {
    expect(isTrivialRewrite("负责客户咨询", "负责 客户咨询")).toBe(true);
    expect(isTrivialRewrite("- 客户咨询。\n- 退款登记。", "- 客户咨询。\n\n- 退款登记。")).toBe(true);
  });
});
