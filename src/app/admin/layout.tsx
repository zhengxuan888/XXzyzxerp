import { redirect } from "next/navigation";

import AppShell from "@/components/admin/AppShell";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { getMembershipAwareMenus } from "@/lib/permission-guard";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) {
    redirect("/login");
  }

  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) {
    redirect("/login");
  }

  const menuMap = await getMembershipAwareMenus({ membershipId: membership.id, userId: session.userId });
  const rootItems = menuMap.get(null) ?? [];
  const availableMemberships = await prisma.membership.findMany({
    where: {
      userId: session.userId,
      isActive: true,
      OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
    },
    include: { businessUnit: true, role: true, department: true, site: true },
    orderBy: { isPrimary: "desc" },
  });
  const membershipOptions = availableMemberships.map((item) => ({
    id: item.id,
    label: `${item.businessUnit?.name || item.businessUnitId} / ${item.role?.name || "未命名角色"}${item.department?.name ? ` / ${item.department.name}` : ""}`,
  }));

  return (
    <AppShell
      menuItems={rootItems}
      brand="ERP V2"
      userName={`${session.username} / ${membership.role?.name ?? "未分配角色"}`}
      memberships={membershipOptions}
      activeMembershipId={membership.id}
      currentPath=""
    >
      {children}
    </AppShell>
  );
}
