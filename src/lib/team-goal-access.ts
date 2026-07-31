import { checkPermission, type PermissionScope } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

type Actor = {
  id: string;
  userId: string;
  businessUnitId: string;
};

type MembershipTarget = {
  id: string;
  userId: string;
  departmentId: string | null;
  siteId: string | null;
};

type DepartmentTarget = {
  id: string;
  name: string;
};

export type TeamGoalAccess = {
  memberships: MembershipTarget[];
  departments: DepartmentTarget[];
  readableMembershipIds: Set<string>;
  readableDepartmentIds: Set<string>;
  manageableDepartmentIds: Set<string>;
  canReadBusinessUnit: boolean;
  canManageBusinessUnit: boolean;
};

const BUSINESS_UNIT_SCOPES: readonly PermissionScope[] = ["ALL", "BUSINESS_UNIT"];
const DEPARTMENT_SCOPES: readonly PermissionScope[] = ["ALL", "BUSINESS_UNIT", "DEPARTMENT", "DEPARTMENT_TREE"];

/**
 * Team goals have two aggregate scopes today: a whole business unit or one
 * department. Reporting-line grants are deliberately not widened into a
 * department aggregate: a manager may read individual subordinates' daily
 * goals, but cannot see or create an aggregate that includes colleagues
 * outside that reporting line.
 */
export async function getTeamGoalAccess(actor: Actor): Promise<TeamGoalAccess> {
  const [memberships, departments, businessRead, businessManage] = await Promise.all([
    prisma.membership.findMany({
      where: {
        businessUnitId: actor.businessUnitId,
        isActive: true,
        OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
      },
      select: { id: true, userId: true, departmentId: true, siteId: true },
    }),
    prisma.department.findMany({
      where: { businessUnitId: actor.businessUnitId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    checkPermission({
      userId: actor.userId,
      membershipId: actor.id,
      actionKey: "team_goal.read",
      targetBusinessUnitId: actor.businessUnitId,
      allowedScopes: BUSINESS_UNIT_SCOPES,
    }),
    checkPermission({
      userId: actor.userId,
      membershipId: actor.id,
      actionKey: "team_goal.manage",
      targetBusinessUnitId: actor.businessUnitId,
      allowedScopes: BUSINESS_UNIT_SCOPES,
    }),
  ]);

  const [membershipReads, departmentReads, departmentManages] = await Promise.all([
    Promise.all(memberships.map((target) => checkPermission({
      userId: actor.userId,
      membershipId: actor.id,
      actionKey: "team_goal.read",
      targetBusinessUnitId: actor.businessUnitId,
      targetDepartmentId: target.departmentId,
      targetSiteId: target.siteId,
      targetUserId: target.userId,
      targetMembershipId: target.id,
    }))),
    Promise.all(departments.map((target) => checkPermission({
      userId: actor.userId,
      membershipId: actor.id,
      actionKey: "team_goal.read",
      targetBusinessUnitId: actor.businessUnitId,
      targetDepartmentId: target.id,
      allowedScopes: DEPARTMENT_SCOPES,
    }))),
    Promise.all(departments.map((target) => checkPermission({
      userId: actor.userId,
      membershipId: actor.id,
      actionKey: "team_goal.manage",
      targetBusinessUnitId: actor.businessUnitId,
      targetDepartmentId: target.id,
      allowedScopes: DEPARTMENT_SCOPES,
    }))),
  ]);

  return {
    memberships,
    departments,
    readableMembershipIds: new Set(memberships.filter((_, index) => membershipReads[index]?.allowed).map((target) => target.id)),
    readableDepartmentIds: new Set(departments.filter((_, index) => departmentReads[index]?.allowed).map((target) => target.id)),
    manageableDepartmentIds: new Set(departments.filter((_, index) => departmentManages[index]?.allowed).map((target) => target.id)),
    canReadBusinessUnit: businessRead.allowed,
    canManageBusinessUnit: businessManage.allowed,
  };
}
