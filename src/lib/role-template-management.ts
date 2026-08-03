import { checkPermission } from "@/lib/permission";

export const ROLE_TEMPLATE_MANAGE_ACTION = "role.template.manage";

export function getRoleTemplateManagementPermission(actor: {
  userId: string;
  membership: { id: string; businessUnitId: string; departmentId: string | null; siteId: string | null };
}) {
  return checkPermission({
    userId: actor.userId,
    membershipId: actor.membership.id,
    actionKey: ROLE_TEMPLATE_MANAGE_ACTION,
    allowedScopes: ["ALL"],
    targetBusinessUnitId: actor.membership.businessUnitId,
    targetDepartmentId: actor.membership.departmentId,
    targetSiteId: actor.membership.siteId,
  });
}
