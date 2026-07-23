import { redirect } from "next/navigation";
import OrderTemplateForm from "@/components/admin/OrderTemplateForm";
import { getActiveMembershipById } from "@/lib/auth";
import { parseOrderTemplateConfiguration } from "@/lib/order-template";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function OrderTemplatesPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const [read, manage] = await Promise.all(["order_template.read", "order_template.manage"].map((actionKey) => checkPermission({
    userId: session.userId, membershipId: membership.id, actionKey, targetBusinessUnitId: membership.businessUnitId,
  })));
  if (!read.allowed) redirect("/admin");
  const templates = await prisma.orderTemplate.findMany({
    where: { businessUnitId: membership.businessUnitId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-semibold">订单模板</h1><p className="mt-1 text-sm text-gray-500">按国家、渠道或店铺配置录单默认值和必填规则，无需改代码。</p></div>
    <OrderTemplateForm canManage={manage.allowed} />
    <div className="grid gap-3 md:grid-cols-2">
      {templates.map((item) => {
        const config = parseOrderTemplateConfiguration(item.configuration);
        return <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex justify-between"><strong>{item.name}</strong>{item.isDefault && <span className="rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-700">默认</span>}</div>
          <p className="mt-1 text-xs text-gray-500">{item.code}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt>币种</dt><dd>{config.currency}</dd><dt>物流渠道</dt><dd>{config.logisticsChannel || "未设置"}</dd><dt>运费</dt><dd>{(config.defaultShippingFeeCents / 100).toFixed(2)}</dd><dt>自定义字段</dt><dd>{config.customFields.length} 个</dd></dl>
        </article>;
      })}
    </div>
  </div>;
}
