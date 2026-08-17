import { notFound } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { demoOpportunities } from "@/lib/opportunities/demo";

export const dynamic = "force-dynamic";

export default async function CockpitPreviewPage({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;

  return (
    <CockpitApp
      initialOpportunities={params.empty === "1" ? [] : demoOpportunities}
      userEmail="cockpit-preview@example.com"
      dataMode="demo"
    />
  );
}
