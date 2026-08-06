import { prisma } from "@/lib/prisma";

export const REMITTANCE_ADMIN_ROLE_CODES = ["platform_admin", "legacy_admin"] as const;

export function isRemittanceAdministrator(roleCode?: string | null) {
  return REMITTANCE_ADMIN_ROLE_CODES.includes(roleCode as (typeof REMITTANCE_ADMIN_ROLE_CODES)[number]);
}

export async function isRemittanceAdministratorRole(roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { code: true } });
  return isRemittanceAdministrator(role?.code);
}
