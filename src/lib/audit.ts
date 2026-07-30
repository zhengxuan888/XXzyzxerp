import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditLogPayload = {
  actorUserId?: string | null;
  actorMembershipId?: string | null;
  module: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  businessUnitId?: string | null;
  roleId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export async function writeAuditLog(payload: AuditLogPayload, client: AuditClient = prisma) {
  await client.auditLog.create({
    data: {
      action: payload.action,
      actorUserId: payload.actorUserId ?? null,
      actorMembershipId: payload.actorMembershipId ?? null,
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
