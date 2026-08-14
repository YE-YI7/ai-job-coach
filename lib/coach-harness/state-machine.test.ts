import { assertRunTransition, canTransitionRun } from "./state-machine";

test("coach runs only use durable transitions", () => {
  expect(canTransitionRun("running", "verifying")).toBe(true);
  expect(canTransitionRun("completed", "running")).toBe(false);
  expect(() => assertRunTransition("completed", "running")).toThrow("Invalid coach run transition");
});
