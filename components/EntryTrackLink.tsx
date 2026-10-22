"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackEntrySelected } from "@/lib/entry-telemetry";
import type { EntryKind } from "@/lib/entry-doors";

/** Keeps the landing page a server component while recording the door choice. */
export default function EntryTrackLink({ kind, href, className, children }: {
  kind: EntryKind;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link className={className} href={href} onClick={() => trackEntrySelected(kind, "click")}>
      {children}
    </Link>
  );
}
