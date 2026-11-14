import { getCurrentUserFromRequest } from "@/lib/auth";
import {canReadEvals, isEvalAdmin} from './eval-access';
export const evalJson = (body: unknown, status = 200) => Response.json(body, {status,
  headers: {"Cache-Control":"private, no-store", Vary:"Cookie"}});
export async function evalAdminAccess(options: {readOnly?: boolean} = {}) {
  const user = await getCurrentUserFromRequest({allowEvalViewer: true});
  const allowed = options.readOnly ? canReadEvals(user) : isEvalAdmin(user);
  return { user, error: !user ? evalJson({error:"请先登录"},401)
    : !allowed ? evalJson({error:"需要管理员权限"},403) : null };
}
