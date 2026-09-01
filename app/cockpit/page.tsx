import { redirect } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities } from "@/lib/coach-harness/repository";

export const dynamic = "force-dynamic";

const allowedTabs = new Set(["overview", "evidence", "resume", "interview", "review", "activity"]);

export default async function CockpitPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUserFromRequest();
  if (!user) redirect("/login?redirect=%2Fcockpit");

  const params = await searchParams;
  const initialTab = params.tab && allowedTabs.has(params.tab) ? params.tab as "overview" | "evidence" | "resume" | "interview" | "review" | "activity" : undefined;
  const opportunities = await listCockpitOpportunities(user.id).catch(() => []);
  return <CockpitApp initialOpportunities={opportunities} userEmail={user.email} dataMode="live" initialTab={initialTab} />;
}
