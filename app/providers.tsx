"use client";

import { InterviewProvider } from "@/store/interviewStore";
import { Suspense } from "react";
import ProductPageTracker from "@/components/ProductPageTracker";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <InterviewProvider>
      <Suspense fallback={null}><ProductPageTracker /></Suspense>
      {children}
    </InterviewProvider>
  );
}

