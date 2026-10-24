"use client";

import { useState } from "react";
import AgentConversation, { type CoachingStart } from "./AgentConversation";
import CurrentArrangement from "./CurrentArrangement";

/** The conversation stays mounted after consuming its one-shot trigger. */
export default function CompanionStart({ onResume, onInterview }: {
  onResume: () => void;
  onInterview: () => void;
}) {
  const [request, setRequest] = useState<CoachingStart | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  return <div>
    <CurrentArrangement
      onOpenResume={onResume}
      onOpenInterview={onInterview}
      onAskMentor={(prompt, id) => {
        setRequest({ id, title: "当前安排", prompt });
        setChatOpen(true);
      }}
    />
    {chatOpen && <AgentConversation
      label="当前安排"
      startRequest={request}
      onStartConsumed={() => setRequest(null)}
    />}
  </div>;
}
