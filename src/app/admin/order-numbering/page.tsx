import { redirect } from "next/navigation";

import OrderNumberingManager, { type OrderNumberRuleRow } from "@/components/admin/OrderNumberingManager";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

const configurationScopes = ["BUSINESS_UNIT", "ALL"] as const;

export default async function OrderNumberingPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [read, manage, rules, departments, templates] = await Promise.all([
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "order.numbering.read", targetBusinessUnitId: membership.businessUnitId, allowedScopes: configurationScopes }),
    checkPermission({ userId: session.userId, membershipId: membership.id, actionKey: "order.numbering.manage", targetBusinessUnitId: membership.businessUnitId, allowedScopes: configurationScopes }),
    prisma.orderNumberRule.findMany({
      where: { businessUnitId: membership.businessUnitId },
      include: {
        department: { select: { id: true, code: true, name: true } },
        orderTemplate: { select: { id: true, code: true, name: true } },
        _count: { select: { orders: true } },
      },
      orderBy: [{ isDefault: "desc" }, { priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.department.findMany({ where: { businessUnitId: membership.businessUnitId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.orderTemplate.findMany({ where: { businessUnitId: membership.businessUnitId, isActive: true }, select: { id: true, code: true, name: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
  ]);
  if (!read.allowed) redirect("/admin");

  return <OrderNumberingManager rules={rules as OrderNumberRuleRow[]} departments={departments} templates={templates} canManage={manage.allowed} />;
}
