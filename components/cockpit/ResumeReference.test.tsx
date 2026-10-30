import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ResumeReferenceProvider, useResumeReference } from "./ResumeReference";
import { makeResumeReference, resolveResumeReference } from "@/lib/opportunities/resume-reference";
import type { ResolvedResumeReference } from "@/lib/opportunities/resume-reference";

jest.mock("@/lib/opportunities/resume-reference", () => ({
  ...jest.requireActual("@/lib/opportunities/resume-reference"),
  makeResumeReference: jest.fn(),
  resolveResumeReference: jest.fn(),
}));
const source = { id: "job", resumeText: "原稿", resumeChanges: [] };
const first: ResolvedResumeReference = {
  version: 1, opportunityId: "job", revision: "r1", changeId: "first",
  sourceHash: "a".repeat(64), changeHash: "b".repeat(64),
  before: "原稿", after: "建议", section: "项目", start: 0, end: 2,
};
const second = { ...first, changeId: "second" };
let control!: NonNullable<ReturnType<typeof useResumeReference>>;
function Capture() {
  const value = useResumeReference();
  React.useLayoutEffect(() => { control = value!; }, [value]);
  return null;
}
let tree: ReactTestRenderer;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: jest.fn(() => JSON.stringify(first)), setItem: jest.fn(), removeItem: jest.fn(),
  } });
});
afterEach(() => {
  act(() => tree?.unmount());
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});
function mount() {
  act(() => { tree = create(<ResumeReferenceProvider source={source} owner="owner"><Capture /></ResumeReferenceProvider>); });
}
test("旧的异步草稿恢复不能盖掉用户新选的引用", async () => {
  let restore!: (value: ResolvedResumeReference) => void;
  (resolveResumeReference as jest.Mock).mockReturnValue(new Promise(resolve => { restore = resolve; }));
  (makeResumeReference as jest.Mock).mockResolvedValue(second);
  mount();
  await act(async () => { await control.quote("second"); });
  await act(async () => { restore(first); });
  expect(control.selection?.pointer.changeId).toBe("second");
});
test("移除引用后，迟到的定位或草稿恢复不能重新塞回输入框", async () => {
  let restore!: (value: ResolvedResumeReference) => void;
  let locate!: (value: ResolvedResumeReference) => void;
  (resolveResumeReference as jest.Mock).mockReturnValue(new Promise(resolve => { restore = resolve; }));
  (makeResumeReference as jest.Mock).mockReturnValue(new Promise(resolve => { locate = resolve; }));
  mount();
  let pending!: Promise<void>;
  act(() => { pending = control.quote("second"); control.clear(); });
  await act(async () => { restore(first); locate(second); await pending; });
  expect(control.selection).toBeNull();
  expect(sessionStorage.setItem).not.toHaveBeenCalled();
});
