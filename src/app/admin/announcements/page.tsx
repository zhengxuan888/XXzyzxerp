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
      listTitle="Announcements"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "title", label: "Title", required: true },
        { key: "content", label: "Content", required: true },
        { key: "publishedAt", label: "Publish Time (YYYY-MM-DD)", required: false },
        { key: "expiredAt", label: "Expired Time (YYYY-MM-DD)", required: false },
        { key: "isActive", label: "Is Active", type: "text", required: false },
      ]}
      dataColumns={[
        { key: "title", label: "Title" },
        { key: "content", label: "Content" },
        { key: "isActive", label: "Active" },
        {
          key: "publishedAt",
          label: "Published At",
          render: (row) => (row.publishedAt ? new Date(String(row.publishedAt)).toLocaleString() : "-"),
        },
      ]}
    />
  );
}
