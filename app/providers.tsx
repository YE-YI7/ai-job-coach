"use client";

import { InterviewProvider } from "@/store/interviewStore";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <InterviewProvider>
      {children}
    </InterviewProvider>
  );
}

