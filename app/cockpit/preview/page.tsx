import { notFound } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { demoOpportunities } from "@/lib/opportunities/demo";

export const dynamic = "force-dynamic";

export default function CockpitPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <CockpitApp
      initialOpportunities={demoOpportunities}
      userEmail="cockpit-preview@example.com"
      dataMode="demo"
    />
  );
}
