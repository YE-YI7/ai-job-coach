import {canShowTutorInvitation} from "./tutor-invitation";

const idle = {turnCount: 0, busy: false, loading: false, pending: "", message: "", dismissed: false};
test("空白新辅导允许主动邀请", () => expect(canShowTutorInvitation(idle)).toBe(true));
test("用户正在学习或刷新恢复已有对话，不重插旧邀请", () => {
  for (const turnCount of [1, 3, 10]) expect(canShowTutorInvitation({...idle, turnCount})).toBe(false);
});
test.each([
  {busy: true}, {loading: true}, {pending: "待发送问题"}, {message: "我的问题"}, {dismissed: true},
])("输入、等待、加载或已忽略时不打断：%j", override => {
  expect(canShowTutorInvitation({...idle, ...override})).toBe(false);
});
