import { redirect } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities } from "@/lib/coach-harness/repository";
import { parseEntryKind } from "@/lib/entry-doors";

export const dynamic = "force-dynamic";

const allowedTabs = new Set(["overview", "evidence", "resume", "interview", "review", "salary"]);

export default async function CockpitPage({ searchParams }: { searchParams: Promise<{ tab?: string; entry?: string }> }) {
  const params = await searchParams;
  const initialEntry = parseEntryKind(params.entry) ?? undefined;
  const user = await getCurrentUserFromRequest();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(initialEntry ? `/cockpit?entry=${initialEntry}` : "/cockpit")}`);
  const initialTab = params.tab && allowedTabs.has(params.tab) ? params.tab as "overview" | "evidence" | "resume" | "interview" | "review" | "salary" : undefined;
  // Only the four-door enum is read out of the URL; anything else is ignored.
  // A failed read is not an empty account. Let the recovery boundary render.
  const opportunities = await listCockpitOpportunities(user.id);
  return <CockpitApp initialOpportunities={opportunities} userEmail={user.email} userId={user.id} dataMode="live" initialTab={initialTab} initialEntry={initialEntry} />;
}
