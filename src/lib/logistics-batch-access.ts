import type { AuthContext } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

export type LogisticsBatchScope = {
  id: string;
  businessUnitId: string;
  departmentId: string | null;
  createdByMembershipId: string;
};

export async function checkLogisticsBatchAccess(
  auth: AuthContext,
  batch: LogisticsBatchScope,
  actionKey: string,
) {
  if (batch.businessUnitId !== auth.membership.businessUnitId) return { allowed: false, reasons: ["SCOPE_BUSINESS_UNIT_MISMATCH"] };
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey,
    targetBusinessUnitId: batch.businessUnitId,
    targetDepartmentId: batch.departmentId,
    targetMembershipId: batch.createdByMembershipId,
  });
}

export async function findAccessibleLogisticsExportBatch(
  auth: AuthContext,
  batchId: string,
  actionKey: string,
) {
  const batch = await prisma.logisticsExportBatch.findFirst({
    where: { id: batchId, businessUnitId: auth.membership.businessUnitId },
    select: { id: true, businessUnitId: true, departmentId: true, createdByMembershipId: true },
  });
  if (!batch) return { batch: null, allowed: false, reasons: ["BATCH_NOT_FOUND"] };
  const decision = await checkLogisticsBatchAccess(auth, batch, actionKey);
  return { batch, ...decision };
}
