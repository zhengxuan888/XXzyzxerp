import { redirect } from "next/navigation";

import CrudPage from "@/components/admin/CrudPage";
import { format } from "date-fns";
import { getSessionFromCookie } from "@/lib/session";
import { getActiveMembershipById } from "@/lib/auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export default async function DocumentsPage() {
  const session = await getSessionFromCookie();
  if (!session?.activeMembershipId) redirect("/login");
  const membership = await getActiveMembershipById(session.activeMembershipId);
  if (!membership) redirect("/login");

  const [canRead, canCreate, canDelete] = await Promise.all([
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "document.read",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "document.create",
      targetBusinessUnitId: membership.businessUnitId,
    }),
    checkPermission({
      userId: session.userId,
      membershipId: membership.id,
      actionKey: "document.delete",
      targetBusinessUnitId: membership.businessUnitId,
    }),
  ]);
  if (!canRead.allowed) redirect("/admin");

  const rows = await prisma.document.findMany({
    where: { businessUnitId: membership.businessUnitId },
    include: { ownerUser: { select: { username: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CrudPage
      apiBase="/api/mvp"
      resource="documents"
      listTitle="Documents"
      canCreate={canCreate.allowed}
      canDelete={canDelete.allowed}
      rows={rows}
      createFields={[
        { key: "title", label: "Title", required: true },
        { key: "fileName", label: "File Name", required: true },
        { key: "fileType", label: "File Type", required: true },
        { key: "storagePath", label: "Storage Path", required: true },
        { key: "fileSizeBytes", label: "File Size(Bytes)", type: "number", required: true },
        { key: "checksum", label: "Checksum" },
        { key: "targetType", label: "Target Type" },
        { key: "targetId", label: "Target ID" },
      ]}
      dataColumns={[
        { key: "title", label: "Title" },
        { key: "fileName", label: "File Name" },
        { key: "fileType", label: "Type" },
        { key: "fileSizeBytes", label: "Size(B)" },
        {
          key: "ownerUser",
          label: "Owner",
          render: (row) => {
            const owner = row.ownerUser as { username?: string; fullName?: string } | undefined;
            return owner ? `${owner.username ?? ""} ${owner.fullName ?? ""}`.trim() : "-";
          },
        },
        {
          key: "createdAt",
          label: "Created",
          render: (row) => {
            const value = row.createdAt;
            if (!value) return "-";
            return format(new Date(String(value)), "yyyy-MM-dd HH:mm:ss");
          },
        },
      ]}
    />
  );
}
