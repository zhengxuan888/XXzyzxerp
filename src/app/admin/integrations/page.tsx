import { KeyRound, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import IntegrationCredentialSettings from "@/components/admin/IntegrationCredentialSettings";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { getSessionFromCookie } from "@/lib/session";

export default async function IntegrationsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");

  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const access = await checkPermission({
    userId: session.userId,
    membershipId: membership.id,
    actionKey: "shipment.workbench.configure",
    targetBusinessUnitId: membership.businessUnitId,
  });
  if (!access.allowed) redirect("/admin");

  return (
    <main className="space-y-4" aria-labelledby="integration-page-title">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <KeyRound size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">系统配置</p>
              <h1 id="integration-page-title" className="mt-1 text-xl font-bold text-slate-950">第三方接口</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                统一管理物流与消息通知服务的连接凭据。修改后立即生效，请在保存前仔细核对。
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <ShieldCheck size={14} aria-hidden="true" />仅限授权人员
          </span>
        </div>
      </header>

      <IntegrationCredentialSettings />
    </main>
  );
}
