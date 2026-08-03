import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function AnnouncementsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "announcement.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "announcement.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "announcement.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.announcement.findMany({
    where: {
      businessUnitId: membership.businessUnitId,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="announcements"
      listTitle="公告管理"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "title", label: "标题", required: true },
        { key: "content", label: "内容", required: true },
        { key: "publishedAt", label: "发布时间（年-月-日）", required: false },
        { key: "expiredAt", label: "失效时间（年-月-日）", required: false },
        { key: "isActive", label: "是否启用", type: "text", required: false },
      ]}
      dataColumns={[
        { key: "title", label: "标题" },
        { key: "content", label: "内容" },
        { key: "isActive", label: "启用状态" },
        {
          key: "publishedAt",
          label: "发布时间",
          render: (row) => (row.publishedAt ? new Date(String(row.publishedAt)).toLocaleString() : "-"),
        },
      ]}
    />
  );
}
