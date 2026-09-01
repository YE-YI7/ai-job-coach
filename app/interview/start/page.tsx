import { redirect } from "next/navigation";

export default function LegacyInterviewStartPage() {
  redirect("/cockpit?tab=interview");
}
