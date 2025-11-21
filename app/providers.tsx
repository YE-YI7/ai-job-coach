"use client";

import { InterviewProvider } from "@/store/interviewStore";
import { AppProvider } from "./context/AppContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <InterviewProvider>{children}</InterviewProvider>
    </AppProvider>
  );
}

