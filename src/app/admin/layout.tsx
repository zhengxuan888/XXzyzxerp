import { redirect } from "next/navigation";

import AppShell from "@/components/admin/AppShell";
import { getActiveMembershipById } from "@/lib/auth";
import { getMembershipAwareMenus } from "@/lib/permission-guard";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/session";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");
  const menuMap = await getMembershipAwareMenus({ membershipId: membership.id, userId: session.userId });
  type MenuNode = (typeof menuMap extends Map<string | null, infer T> ? T extends Array<infer U> ? U : never : never) & { children?: MenuNode[] };
  const buildTree = (parentId: string | null): MenuNode[] => (menuMap.get(parentId) ?? []).map((item) => ({ ...item, children: buildTree(item.id) }));
  const rootItems = buildTree(null);
  const availableMemberships = await prisma.membership.findMany({
    where: { userId: session.userId, isActive: true, OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }] },
    include: {
      businessUnit: { include: { legalEntity: true } },
      legalEntity: true,
      role: true,
      department: true,
      site: true,
    },
    orderBy: { isPrimary: "desc" },
  });
  const usableMemberships = availableMemberships.filter((item) => (
    item.legalEntity.isActive
    && item.businessUnit.isActive
    && item.businessUnit.legalEntity.isActive
    && item.businessUnit.legalEntityId === item.legalEntityId
  ));
  const membershipOptions = usableMemberships.map((item) => ({ id: item.id, label: `${item.businessUnit?.name || item.businessUnitId} / ${item.role?.name || "未命名角色"}${item.department?.name ? ` / ${item.department.name}` : ""}` }));
  return <AppShell menuItems={rootItems} brand="择优臻选 ERP" userName={`${session.username} · ${membership.role?.name ?? "未分配角色"}`} memberships={membershipOptions} activeMembershipId={membership.id} currentPath="">{children}</AppShell>;
}
