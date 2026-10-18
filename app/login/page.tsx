import LoginClient from "./LoginClient";
import { phoneAuthConfigured } from "@/lib/phone-auth/provider";

export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <LoginClient phoneEnabled={phoneAuthConfigured()} />;
}
