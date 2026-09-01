import { redirect } from "next/navigation";

export default function LegacyResumeEditorPage() {
  redirect("/cockpit?tab=resume");
}
