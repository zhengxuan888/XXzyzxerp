export const ADMIN_RESOURCE_MAP = {
  "legal-entities": {
    model: "legalEntity" as const,
    readAction: "legal_entity.read",
    writeAction: "legal_entity.create",
    deleteAction: "legal_entity.delete",
  },
  "business-units": {
    model: "businessUnit" as const,
    readAction: "business_unit.read",
    writeAction: "business_unit.create",
    deleteAction: "business_unit.delete",
  },
  departments: {
    model: "department" as const,
    readAction: "department.read",
    writeAction: "department.create",
    deleteAction: "department.delete",
  },
  users: {
    model: "user" as const,
    readAction: "user.read",
    writeAction: "user.create",
    deleteAction: "user.delete",
  },
  memberships: {
    model: "membership" as const,
    readAction: "membership.read",
    writeAction: "membership.create",
    deleteAction: "membership.delete",
  },
  roles: {
    model: "role" as const,
    readAction: "role.read",
    writeAction: "role.create",
    deleteAction: "role.delete",
  },
  menus: {
    model: "menu" as const,
    readAction: "menu.read",
    writeAction: "menu.create",
    deleteAction: "menu.delete",
  },
  "access-grants": {
    model: "accessGrant" as const,
    readAction: "access_grant.read",
    writeAction: "access_grant.create",
    deleteAction: "access_grant.delete",
  },
  "sites": {
    model: "site" as const,
    readAction: "site.read",
    writeAction: "site.create",
    deleteAction: "site.delete",
  },
} as const;

export type AdminResource = keyof typeof ADMIN_RESOURCE_MAP;
