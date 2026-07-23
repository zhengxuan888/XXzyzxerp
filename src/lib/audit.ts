import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditLogPayload = {
  actorUserId: string;
  actorMembershipId: string;
  module: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  businessUnitId?: string | null;
  roleId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

export async function writeAuditLog(payload: AuditLogPayload) {
  await prisma.auditLog.create({
    data: {
      action: payload.action,
      actorUserId: payload.actorUserId,
      actorMembershipId: payload.actorMembershipId,
      module: payload.module,
      targetType: payload.targetType,
      targetId: payload.targetId ?? null,
      businessUnitId: payload.businessUnitId ?? null,
      roleId: payload.roleId ?? null,
      details: payload.details ? (payload.details as Prisma.InputJsonValue) : Prisma.JsonNull,
      ipAddress: payload.ipAddress ?? null,
    },
  });
}
