import { checkPermission, type PermissionDecision } from "@/lib/permission";

/**
 * Stable action key for the very small set of configuration records that are
 * shared by every business unit (for example the global role and menu
 * registries).  This is deliberately an action, not a role-name check: who
 * can hold it remains entirely data-driven through role permissions and
 * delegated grants.
 */
export const SYSTEM_CONFIGURATION_MANAGE_ACTION = "system.configuration.manage";

type ConfigurationActor = {
  userId: string;
  membership: {
    id: string;
    businessUnitId: string;
    departmentId: string | null;
    siteId: string | null;
  };
};

export async function getSystemConfigurationPermission(actor: ConfigurationActor): Promise<PermissionDecision> {
  return checkPermission({
    userId: actor.userId,
    membershipId: actor.membership.id,
    actionKey: SYSTEM_CONFIGURATION_MANAGE_ACTION,
    // A global registry must only be administered by an explicitly global
    // configuration capability.  ALL still remains constrained to the active
    // business context by the common permission engine.
    allowedScopes: ["ALL"],
    targetBusinessUnitId: actor.membership.businessUnitId,
    targetDepartmentId: actor.membership.departmentId,
    targetSiteId: actor.membership.siteId,
  });
}
