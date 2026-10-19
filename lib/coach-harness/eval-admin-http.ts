import { getCurrentUserFromRequest } from "@/lib/auth";
import { isEvalAdmin } from "./eval-access";
export const evalJson = (body: unknown, status = 200) => Response.json(body, {status,
  headers: {"Cache-Control":"private, no-store", Vary:"Cookie"}});
export async function evalAdminAccess() {
  const user = await getCurrentUserFromRequest();
  return { user, error: !user ? evalJson({error:"请先登录"},401)
    : !isEvalAdmin(user) ? evalJson({error:"需要管理员权限"},403) : null };
}
