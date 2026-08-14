import type { CoachRunStatus } from "./types";

const transitions: Record<CoachRunStatus, CoachRunStatus[]> = {
  queued: ["planning", "cancelled"],
  planning: ["running", "awaiting_user", "failed", "cancelled"],
  running: ["awaiting_user", "verifying", "failed", "cancelled"],
  awaiting_user: ["running", "cancelled"],
  verifying: ["completed", "running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionRun(from: CoachRunStatus, to: CoachRunStatus) {
  return transitions[from].includes(to);
}

export function assertRunTransition(from: CoachRunStatus, to: CoachRunStatus) {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Invalid coach run transition: ${from} -> ${to}`);
  }
}
