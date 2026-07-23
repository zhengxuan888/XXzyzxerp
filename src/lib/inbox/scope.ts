export type InboxScope = {
  businessUnitId: string;
  departmentId: string | null;
  permissionReasons: string[];
};

export function inboxScopeWhere(scope: InboxScope) {
  const hasBusinessUnitScope = scope.permissionReasons.some((reason) =>
    ["SCOPE_ALL", "SCOPE_ALL_OK", "SCOPE_BUSINESS_UNIT_OK"].includes(reason),
  );
  return {
    businessUnitId: scope.businessUnitId,
    ...(hasBusinessUnitScope ? {} : { departmentId: scope.departmentId ?? "__NO_DEPARTMENT__" }),
  };
}

export function canAssignToDepartment(actorDepartmentId: string | null, targetDepartmentId: string | null, reasons: string[]) {
  if (reasons.some((reason) => ["SCOPE_ALL", "SCOPE_ALL_OK", "SCOPE_BUSINESS_UNIT_OK"].includes(reason))) return true;
  return Boolean(actorDepartmentId && targetDepartmentId && actorDepartmentId === targetDepartmentId);
}
