import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type SeedAction = {
  key: string;
  name: string;
  namespace: string;
  scope: "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "SITE" | "SELF";
};

const actionDefs: SeedAction[] = [
  { key: "legal_entity.read", name: "Legal entity read", namespace: "erp", scope: "ALL" },
  { key: "legal_entity.create", name: "Legal entity create", namespace: "erp", scope: "ALL" },
  { key: "legal_entity.delete", name: "Legal entity delete", namespace: "erp", scope: "ALL" },
  { key: "business_unit.read", name: "Business unit read", namespace: "erp", scope: "ALL" },
  { key: "business_unit.create", name: "Business unit create", namespace: "erp", scope: "ALL" },
  { key: "business_unit.delete", name: "Business unit delete", namespace: "erp", scope: "ALL" },
  { key: "department.read", name: "Department read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "department.create", name: "Department create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "department.delete", name: "Department delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.read", name: "Site read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.create", name: "Site create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.delete", name: "Site delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.read", name: "User read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.create", name: "User create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.delete", name: "User delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.read", name: "Membership read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.create", name: "Membership create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.delete", name: "Membership delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "role.read", name: "Role read", namespace: "erp", scope: "ALL" },
  { key: "role.create", name: "Role create", namespace: "erp", scope: "ALL" },
  { key: "role.delete", name: "Role delete", namespace: "erp", scope: "ALL" },
  { key: "menu.read", name: "Menu read", namespace: "erp", scope: "ALL" },
  { key: "menu.create", name: "Menu create", namespace: "erp", scope: "ALL" },
  { key: "menu.delete", name: "Menu delete", namespace: "erp", scope: "ALL" },
  { key: "access_grant.read", name: "Access grant read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "access_grant.create", name: "Access grant create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "access_grant.delete", name: "Access grant delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "delegation.manage", name: "Delegation manage", namespace: "erp", scope: "ALL" },

  { key: "dashboard.view", name: "Dashboard view", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "customer.read", name: "Customer read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "customer.create", name: "Customer create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "customer.delete", name: "Customer delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "product.read", name: "Product read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.create", name: "Product create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.delete", name: "Product delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "sku.create", name: "SKU create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "inventory.read", name: "Inventory read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "inventory.adjust", name: "Inventory adjust", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order_template.read", name: "Order template read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order_template.manage", name: "Order template manage", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "order.read", name: "Order read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.create", name: "Order create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.update", name: "Order update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.delete", name: "Order delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.status.update", name: "Order status update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.submit", name: "提交订单核单", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.review", name: "订单核单", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.ship", name: "订单发货", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "shipment.read", name: "Shipment read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "shipment.create", name: "Shipment create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "shipment.track.update", name: "Shipment track update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics_template.read", name: "查看物流商模板", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics_template.manage", name: "配置物流商模板", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics_template.export", name: "导出物流商订单", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "expense.read", name: "Expense read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "expense.create", name: "Expense create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "expense.delete", name: "Expense delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "attendance.read", name: "Attendance read", namespace: "erp", scope: "DEPARTMENT" },
  { key: "attendance.create", name: "Attendance create", namespace: "erp", scope: "DEPARTMENT" },
  { key: "attendance.delete", name: "Attendance delete", namespace: "erp", scope: "DEPARTMENT" },
  { key: "attendance.approve", name: "Attendance approve", namespace: "erp", scope: "DEPARTMENT" },

  { key: "leave_request.read", name: "Leave request read", namespace: "erp", scope: "SELF" },
  { key: "leave_request.create", name: "Leave request create", namespace: "erp", scope: "SELF" },
  { key: "leave_request.approve", name: "Leave request approve", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "announcement.read", name: "Announcement read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "announcement.create", name: "Announcement create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "announcement.delete", name: "Announcement delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "document.read", name: "Document read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "document.create", name: "Document create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "document.delete", name: "Document delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "approval.submit", name: "Approval submit", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "approval.review", name: "Approval review", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "inbox.read", name: "统一收件箱查看", namespace: "inbox", scope: "DEPARTMENT" },
  { key: "inbox.sync.demo", name: "演示渠道同步", namespace: "inbox", scope: "DEPARTMENT" },
  { key: "inbox.manage", name: "会话状态与标签管理", namespace: "inbox", scope: "DEPARTMENT" },
  { key: "inbox.assign", name: "会话分派", namespace: "inbox", scope: "DEPARTMENT" },
  { key: "inbox.customer.link", name: "关联客户或线索", namespace: "inbox", scope: "DEPARTMENT" },
  { key: "attachment.read", name: "附件查看", namespace: "attachment", scope: "DEPARTMENT" },
  { key: "attachment.create", name: "附件上传", namespace: "attachment", scope: "DEPARTMENT" },
  { key: "attachment.delete", name: "附件删除", namespace: "attachment", scope: "DEPARTMENT" },
];

const menuDefs = [
  {
    key: "dashboard",
    label: "工作台",
    path: "/admin",
    requiredActionKey: "dashboard.view",
    sortOrder: 1,
    isActive: true,
  },
  {
    key: "organizations",
    label: "公司主体",
    path: "/admin/organizations",
    requiredActionKey: "legal_entity.read",
    sortOrder: 10,
    isActive: true,
  },
  {
    key: "business-units",
    label: "业务板块",
    path: "/admin/business-units",
    requiredActionKey: "business_unit.read",
    sortOrder: 20,
    isActive: true,
  },
  {
    key: "departments",
    label: "部门管理",
    path: "/admin/departments",
    requiredActionKey: "department.read",
    sortOrder: 30,
    isActive: true,
  },
  {
    key: "sites",
    label: "站点管理",
    path: "/admin/sites",
    requiredActionKey: "site.read",
    sortOrder: 40,
    isActive: true,
  },
  {
    key: "users",
    label: "员工账号",
    path: "/admin/users",
    requiredActionKey: "user.read",
    sortOrder: 50,
    isActive: true,
  },
  {
    key: "memberships",
    label: "岗位与归属",
    path: "/admin/memberships",
    requiredActionKey: "membership.read",
    sortOrder: 60,
    isActive: true,
  },
  {
    key: "roles",
    label: "角色权限",
    path: "/admin/roles",
    requiredActionKey: "role.read",
    sortOrder: 70,
    isActive: true,
  },
  {
    key: "menus",
    label: "菜单管理",
    path: "/admin/menus",
    requiredActionKey: "menu.read",
    sortOrder: 80,
    isActive: true,
  },
  {
    key: "access-grants",
    label: "协作授权",
    path: "/admin/access-grants",
    requiredActionKey: "access_grant.read",
    sortOrder: 90,
    isActive: true,
  },
  {
    key: "unified-inbox",
    label: "统一收件箱",
    path: "/admin/inbox",
    requiredActionKey: "inbox.read",
    sortOrder: 95,
    isActive: true,
  },
  {
    key: "customers",
    label: "客户管理",
    path: "/admin/customers",
    requiredActionKey: "customer.read",
    sortOrder: 100,
    isActive: true,
  },
  {
    key: "products",
    label: "商品管理",
    path: "/admin/products",
    requiredActionKey: "product.read",
    sortOrder: 110,
    isActive: true,
  },
  {
    key: "orders",
    label: "订单管理",
    path: "/admin/orders",
    requiredActionKey: "order.read",
    sortOrder: 120,
    isActive: true,
  },
  {
    key: "order-review",
    label: "核单工作台",
    path: "/admin/order-review",
    requiredActionKey: "order.review",
    sortOrder: 122,
    isActive: true,
  },
  {
    key: "shipping-workbench",
    label: "待发货工作台",
    path: "/admin/shipping",
    requiredActionKey: "shipment.create",
    sortOrder: 125,
    isActive: true,
  },
  {
    key: "order-templates",
    label: "订单模板",
    path: "/admin/order-templates",
    requiredActionKey: "order_template.read",
    sortOrder: 118,
    isActive: true,
  },
  {
    key: "inventory",
    label: "库存管理",
    path: "/admin/inventory",
    requiredActionKey: "inventory.read",
    sortOrder: 115,
    isActive: true,
  },
  {
    key: "shipments",
    label: "发货与物流",
    path: "/admin/shipments",
    requiredActionKey: "shipment.read",
    sortOrder: 130,
    isActive: true,
  },
  {
    key: "expenses",
    label: "费用支出",
    path: "/admin/expenses",
    requiredActionKey: "expense.read",
    sortOrder: 140,
    isActive: true,
  },
  {
    key: "approvals",
    label: "审批管理",
    path: "/admin/approvals",
    requiredActionKey: "approval.submit",
    sortOrder: 150,
    isActive: true,
  },
  {
    key: "attendance",
    label: "考勤管理",
    path: "/admin/attendance",
    requiredActionKey: "attendance.read",
    sortOrder: 160,
    isActive: true,
  },
  {
    key: "leave-requests",
    label: "请假管理",
    path: "/admin/leave-requests",
    requiredActionKey: "leave_request.read",
    sortOrder: 170,
    isActive: true,
  },
  {
    key: "announcements",
    label: "公告管理",
    path: "/admin/announcements",
    requiredActionKey: "announcement.read",
    sortOrder: 180,
    isActive: true,
  },
  {
    key: "documents",
    label: "文档管理",
    path: "/admin/documents",
    requiredActionKey: "document.read",
    sortOrder: 190,
    isActive: true,
  },
];

const menuGroupDefs = [
  { key: "group-sales", label: "销售与订单", path: "/admin/orders", icon: "ShoppingCart", sortOrder: 10 },
  { key: "group-logistics", label: "物流与售后", path: "/admin/shipping", icon: "Truck", sortOrder: 20 },
  { key: "group-customer", label: "客户与消息", path: "/admin/customers", icon: "MessagesSquare", sortOrder: 30 },
  { key: "group-product", label: "商品与库存", path: "/admin/products", icon: "Package", sortOrder: 40 },
  { key: "group-finance", label: "财务与审批", path: "/admin/expenses", icon: "WalletCards", sortOrder: 50 },
  { key: "group-hr", label: "人事与行政", path: "/admin/attendance", icon: "UsersRound", sortOrder: 60 },
  { key: "group-organization", label: "组织与权限", path: "/admin/users", icon: "ShieldCheck", sortOrder: 70 },
  { key: "group-system", label: "系统配置", path: "/admin/menus", icon: "Settings2", sortOrder: 80 },
] as const;

const menuGroupByKey: Record<string, (typeof menuGroupDefs)[number]["key"]> = {
  orders: "group-sales",
  "order-review": "group-sales",
  "order-templates": "group-sales",
  "shipping-workbench": "group-logistics",
  shipments: "group-logistics",
  customers: "group-customer",
  "unified-inbox": "group-customer",
  products: "group-product",
  inventory: "group-product",
  expenses: "group-finance",
  approvals: "group-finance",
  attendance: "group-hr",
  "leave-requests": "group-hr",
  announcements: "group-hr",
  documents: "group-hr",
  organizations: "group-organization",
  "business-units": "group-organization",
  departments: "group-organization",
  sites: "group-organization",
  users: "group-organization",
  memberships: "group-organization",
  roles: "group-organization",
  "access-grants": "group-organization",
  menus: "group-system",
};

async function main() {
  const legalEntity = await prisma.legalEntity.upsert({
    where: { code: "SAMPLE_LEGAL_ENTITY" },
    update: { name: "演示公司" },
    create: {
      code: "SAMPLE_LEGAL_ENTITY",
      name: "演示公司",
    },
  });

  const businessUnit = await prisma.businessUnit.upsert({
    where: { legalEntityId_code: { legalEntityId: legalEntity.id, code: "SAMPLE_BU" } },
    update: { name: "Facebook COD 演示板块" },
    create: {
      legalEntityId: legalEntity.id,
      code: "SAMPLE_BU",
      name: "Facebook COD 演示板块",
    },
  });

  const existingRootDepartment = await prisma.department.findFirst({
    where: {
      businessUnitId: businessUnit.id,
      code: "ROOT_DEPT",
      parentId: null,
    },
  });
  const rootDepartment =
    existingRootDepartment ??
    (await prisma.department.create({
      data: {
        businessUnitId: businessUnit.id,
        code: "ROOT_DEPT",
        name: "默认部门",
        hierarchyPath: "/ROOT_DEPT",
      },
    }));
  if (existingRootDepartment && existingRootDepartment.name !== "默认部门") {
    await prisma.department.update({ where: { id: existingRootDepartment.id }, data: { name: "默认部门" } });
  }

  const site = await prisma.site.upsert({
    where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "DEFAULT_SITE" } },
    update: { name: "默认站点" },
    create: {
      code: "DEFAULT_SITE",
      name: "默认站点",
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
    },
  });

  const dashboardAction = actionDefs.find((action) => action.key === "dashboard.view");
  for (const action of actionDefs) {
    await prisma.action.upsert({
      where: { key: action.key },
      update: {
        name: action.name,
        namespace: action.namespace,
      },
      create: {
        key: action.key,
        name: action.name,
        namespace: action.namespace,
      },
    });
  }

  const actions = await prisma.action.findMany();
  const actionSeedMap = new Map(actionDefs.map((action) => [action.key, action]));

  const groupIds = new Map<string, string>();
  for (const group of menuGroupDefs) {
    const row = await prisma.menu.upsert({
      where: { key: group.key },
      update: { label: group.label, path: group.path, icon: group.icon, sortOrder: group.sortOrder, isActive: true },
      create: { ...group, isActive: true },
    });
    groupIds.set(group.key, row.id);
  }

  for (const menu of menuDefs) {
    const parentId = menu.key === "dashboard" ? null : groupIds.get(menuGroupByKey[menu.key]) ?? null;
    await prisma.menu.upsert({
      where: { key: menu.key },
      update: {
        label: menu.label,
        path: menu.path,
        requiredActionKey: menu.requiredActionKey,
        sortOrder: menu.sortOrder,
        isActive: menu.isActive,
        parentId,
      },
      create: {
        key: menu.key,
        label: menu.label,
        path: menu.path,
        requiredActionKey: menu.requiredActionKey,
        sortOrder: menu.sortOrder,
        isActive: menu.isActive,
        parentId,
      },
    });
  }

  const roleFounder = await prisma.role.upsert({
    where: { code: "platform_admin" },
    update: {
      name: "平台管理员",
      isSystem: true,
    },
    create: {
      code: "platform_admin",
      name: "平台管理员",
      description: "负责平台级配置和全部业务板块管理。",
      isSystem: true,
    },
  });

  const roleManager = await prisma.role.upsert({
    where: { code: "business_manager" },
    update: {
      name: "业务板块负责人",
      isSystem: true,
    },
    create: {
      code: "business_manager",
      name: "业务板块负责人",
      description: "仅管理本人有效岗位所属业务板块内的人员、岗位与业务。",
      isSystem: true,
    },
  });

  const roleStaff = await prisma.role.upsert({
    where: { code: "employee" },
    update: {
      name: "普通员工",
      isSystem: false,
    },
    create: {
      code: "employee",
      name: "普通员工",
      description: "按配置权限执行日常业务操作。",
      isSystem: false,
    },
  });

  for (const action of actions) {
    await prisma.rolePermission.upsert({
      where: { roleId_actionKey: { roleId: roleFounder.id, actionKey: action.key } },
      update: { isAllowed: true, scope: "ALL" },
      create: {
        roleId: roleFounder.id,
        actionKey: action.key,
        scope: "ALL",
        isAllowed: true,
      },
    });
  }

  const managerAllowed = new Set([
    "dashboard.view",
    "legal_entity.read",
    "legal_entity.create",
    "business_unit.read",
    "business_unit.create",
    "department.read",
    "department.create",
    "site.read",
    "site.create",
    "user.read",
    "membership.read",
    "membership.create",
    "membership.delete",
    "role.read",
    "menu.read",
    "menu.create",
    "access_grant.read",
    "access_grant.create",
    "access_grant.delete",
    "delegation.manage",
    "customer.read",
    "customer.create",
    "customer.delete",
    "product.read",
    "product.create",
    "product.delete",
    "sku.create",
    "inventory.read",
    "inventory.adjust",
    "order_template.read",
    "order_template.manage",
    "order.read",
    "order.create",
    "order.update",
    "order.delete",
    "order.status.update",
    "order.submit",
    "order.review",
    "order.ship",
    "shipment.read",
    "shipment.create",
    "shipment.track.update",
    "logistics_template.read",
    "logistics_template.manage",
    "logistics_template.export",
    "expense.read",
    "expense.create",
    "expense.delete",
    "attendance.read",
    "attendance.create",
    "attendance.delete",
    "attendance.approve",
    "leave_request.read",
    "leave_request.create",
    "leave_request.approve",
    "announcement.read",
    "announcement.create",
    "announcement.delete",
    "document.read",
    "document.create",
    "document.delete",
    "approval.submit",
    "approval.review",
    "inbox.read",
    "inbox.sync.demo",
    "inbox.manage",
    "inbox.assign",
    "inbox.customer.link",
    "attachment.read",
    "attachment.create",
    "attachment.delete",
  ]);

  for (const action of actions) {
    const allow = managerAllowed.has(action.key);
    await prisma.rolePermission.upsert({
      where: { roleId_actionKey: { roleId: roleManager.id, actionKey: action.key } },
      update: {
        isAllowed: allow,
        scope: allow ? actionSeedMap.get(action.key)?.scope ?? "BUSINESS_UNIT" : "SELF",
      },
      create: {
        roleId: roleManager.id,
        actionKey: action.key,
        scope: allow ? actionSeedMap.get(action.key)?.scope ?? "BUSINESS_UNIT" : "SELF",
        isAllowed: allow,
      },
    });
  }

  for (const action of actions) {
    await prisma.rolePermission.upsert({
      where: { roleId_actionKey: { roleId: roleStaff.id, actionKey: action.key } },
      update: { isAllowed: false, scope: "SELF" },
      create: {
        roleId: roleStaff.id,
        actionKey: action.key,
        scope: "SELF",
        isAllowed: false,
      },
    });
  }

  const menuList = await prisma.menu.findMany();
  for (const menu of menuList) {
    await prisma.menuPermission.upsert({
      where: { menuId_roleId: { menuId: menu.id, roleId: roleFounder.id } },
      update: { isEnabled: true },
      create: {
        menuId: menu.id,
        roleId: roleFounder.id,
        isEnabled: true,
      },
    });
    await prisma.menuPermission.upsert({
      where: { menuId_roleId: { menuId: menu.id, roleId: roleManager.id } },
      update: { isEnabled: menu.requiredActionKey !== "menu.create" },
      create: {
        menuId: menu.id,
        roleId: roleManager.id,
        isEnabled: menu.requiredActionKey !== "menu.create",
      },
    });
    await prisma.menuPermission.upsert({
      where: { menuId_roleId: { menuId: menu.id, roleId: roleStaff.id } },
      update: { isEnabled: menu.requiredActionKey === "dashboard.view" },
      create: {
        menuId: menu.id,
        roleId: roleStaff.id,
        isEnabled: menu.requiredActionKey === "dashboard.view",
      },
    });
  }

  const founderPassword = await bcrypt.hash(process.env.SEED_FOUNDER_PASSWORD || "ChangeMe#2026", 10);
  const founderUser = await prisma.user.upsert({
    where: { username: "founder" },
    update: { fullName: "演示管理员" },
    create: {
      username: "founder",
      email: "founder@local.erp",
      fullName: "演示管理员",
      passwordHash: founderPassword,
      isActive: true,
    },
  });
  const restrictedUser = await prisma.user.upsert({
    where: { username: "测试员工_中文" },
    update: { fullName: "受限演示员工", isActive: true, passwordHash: founderPassword },
    create: {
      username: "测试员工_中文",
      email: "restricted.employee@local.erp",
      fullName: "受限演示员工",
      passwordHash: founderPassword,
      isActive: true,
    },
  });

  const existingFounderMembership = await prisma.membership.findFirst({
    where: {
      userId: founderUser.id,
      businessUnitId: businessUnit.id,
      roleId: roleFounder.id,
      isPrimary: true,
    },
  });
  if (!existingFounderMembership) {
    await prisma.membership.create({
      data: {
        userId: founderUser.id,
        legalEntityId: legalEntity.id,
        businessUnitId: businessUnit.id,
        departmentId: rootDepartment.id,
        siteId: site.id,
        roleId: roleFounder.id,
        isPrimary: true,
        isActive: true,
        scope: "ALL",
        startedAt: new Date(),
      },
    });
  }
  const existingRestrictedMembership = await prisma.membership.findFirst({
    where: { userId: restrictedUser.id, businessUnitId: businessUnit.id, roleId: roleStaff.id, isPrimary: true },
  });
  if (!existingRestrictedMembership) {
    await prisma.membership.create({
      data: {
        userId: restrictedUser.id,
        legalEntityId: legalEntity.id,
        businessUnitId: businessUnit.id,
        departmentId: rootDepartment.id,
        siteId: site.id,
        roleId: roleStaff.id,
        isPrimary: true,
        isActive: true,
        scope: "SELF",
      },
    });
  }

  const demoCustomer = await prisma.customer.upsert({
    where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "DEMO-CUSTOMER-001" } },
    update: {
      name: "演示客户",
      contactName: "王女士",
      contactPhone: "13800000000",
      address: "演示地址（非真实数据）",
      isActive: true,
    },
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
      code: "DEMO-CUSTOMER-001",
      name: "演示客户",
      contactName: "王女士",
      contactPhone: "13800000000",
      address: "演示地址（非真实数据）",
    },
  });

  const founderMembership = await prisma.membership.findFirstOrThrow({
    where: { userId: founderUser.id, businessUnitId: businessUnit.id, isPrimary: true, isActive: true },
  });
  const demoConnection = await prisma.channelConnection.upsert({
    where: {
      businessUnitId_providerKey_externalRef: {
        businessUnitId: businessUnit.id,
        providerKey: "DEMO",
        externalRef: "demo-local",
      },
    },
    update: { displayName: "本地演示渠道", departmentId: rootDepartment.id, isActive: true },
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
      providerKey: "DEMO",
      displayName: "本地演示渠道",
      externalRef: "demo-local",
      configuration: { mode: "local_only", credentials: false },
    },
  });
  const demoIdentity = await prisma.contactIdentity.upsert({
    where: {
      channelConnectionId_providerContactKey: {
        channelConnectionId: demoConnection.id,
        providerContactKey: "demo-contact-001",
      },
    },
    update: { displayName: "演示咨询客户" },
    create: {
      businessUnitId: businessUnit.id,
      channelConnectionId: demoConnection.id,
      providerContactKey: "demo-contact-001",
      displayName: "演示咨询客户",
      normalizedAddress: "demo-contact-001",
    },
  });
  await prisma.inboxTag.upsert({
    where: { businessUnitId_name: { businessUnitId: businessUnit.id, name: "高意向" } },
    update: { color: "violet", isActive: true },
    create: { businessUnitId: businessUnit.id, name: "高意向", color: "violet" },
  });
  await prisma.inboxTag.upsert({
    where: { businessUnitId_name: { businessUnitId: businessUnit.id, name: "待回访" } },
    update: { color: "amber", isActive: true },
    create: { businessUnitId: businessUnit.id, name: "待回访", color: "amber" },
  });
  const demoConversation = await prisma.conversation.upsert({
    where: {
      channelConnectionId_providerThreadKey: {
        channelConnectionId: demoConnection.id,
        providerThreadKey: "demo-thread-001",
      },
    },
    update: { preview: "请问这个商品多久可以送达？", departmentId: rootDepartment.id },
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
      channelConnectionId: demoConnection.id,
      contactIdentityId: demoIdentity.id,
      providerThreadKey: "demo-thread-001",
      subject: "商品配送咨询",
      preview: "请问这个商品多久可以送达？",
      unreadCount: 1,
      lastMessageAt: new Date(),
    },
  });
  await prisma.message.upsert({
    where: {
      conversationId_providerMessageKey: {
        conversationId: demoConversation.id,
        providerMessageKey: "demo-message-001",
      },
    },
    update: {},
    create: {
      conversationId: demoConversation.id,
      providerMessageKey: "demo-message-001",
      direction: "INBOUND",
      senderIdentity: "demo-contact-001",
      contentText: "请问这个商品多久可以送达？",
      occurredAt: new Date(),
    },
  });
  await prisma.conversationAssignment.upsert({
    where: { id: "00000000-0000-4000-8000-000000000101" },
    update: { assigneeMembershipId: founderMembership.id, isActive: true, endedAt: null },
    create: {
      id: "00000000-0000-4000-8000-000000000101",
      conversationId: demoConversation.id,
      assigneeMembershipId: founderMembership.id,
      assignedByMembershipId: founderMembership.id,
    },
  });

  const demoProduct = await prisma.product.upsert({
    where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "DEMO-PRODUCT-001" } },
    update: { name: "演示商品", category: "演示分类", unit: "件", isActive: true },
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      code: "DEMO-PRODUCT-001",
      name: "演示商品",
      description: "仅用于本地 ERP 流程验收",
      category: "演示分类",
      unit: "件",
    },
  });

  const demoSku = await prisma.productSku.upsert({
    where: { productId_code: { productId: demoProduct.id, code: "DEMO-SKU-RED" } },
    update: { barcode: "DEMO000001", isActive: true },
    create: {
      productId: demoProduct.id,
      code: "DEMO-SKU-RED",
      barcode: "DEMO000001",
      attributes: { color: "红色", purpose: "本地演示" },
    },
  });

  await prisma.orderTemplate.upsert({
    where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "DEFAULT_COD" } },
    update: {
      name: "Facebook COD 标准订单",
      description: "默认 COD 订单录入模板",
      configuration: {
        currency: "CNY",
        defaultShippingFeeCents: 0,
        defaultCodAmountCents: 0,
        requireCodAmount: true,
        requireRecipientPhone: true,
        requireRecipientEmail: true,
        requireRecipientAddress: true,
        requireSku: true,
        customFields: [
          { key: "salesChannel", label: "销售渠道", type: "text", required: false },
          { key: "customerRemark", label: "客户要求", type: "text", required: false },
        ],
      },
      isDefault: true,
      isActive: true,
    },
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      code: "DEFAULT_COD",
      name: "Facebook COD 标准订单",
      description: "默认 COD 订单录入模板",
      configuration: {
        currency: "CNY",
        defaultShippingFeeCents: 0,
        defaultCodAmountCents: 0,
        requireCodAmount: true,
        requireRecipientPhone: true,
        requireRecipientEmail: true,
        requireRecipientAddress: true,
        requireSku: true,
        customFields: [
          { key: "salesChannel", label: "销售渠道", type: "text", required: false },
          { key: "customerRemark", label: "客户要求", type: "text", required: false },
        ],
      },
      isDefault: true,
    },
  });

  await prisma.inventoryBalance.upsert({
    where: {
      businessUnitId_siteId_skuId: {
        businessUnitId: businessUnit.id,
        siteId: site.id,
        skuId: demoSku.id,
      },
    },
    update: {},
    create: {
      businessUnitId: businessUnit.id,
      siteId: site.id,
      skuId: demoSku.id,
      onHandQuantity: 100,
      reservedQuantity: 0,
    },
  });

  void demoCustomer;

  for (const action of actions) {
    await prisma.delegationRule.upsert({
      where: { roleId_actionKey: { roleId: roleFounder.id, actionKey: action.key } },
      update: { canTransfer: true, maxScope: "ALL" },
      create: {
        roleId: roleFounder.id,
        actionKey: action.key,
        canTransfer: true,
        maxScope: "ALL",
      },
    });
    if (managerAllowed.has(action.key)) {
      await prisma.delegationRule.upsert({
        where: { roleId_actionKey: { roleId: roleManager.id, actionKey: action.key } },
        update: { canTransfer: true, maxScope: actionSeedMap.get(action.key)?.scope ?? "DEPARTMENT" },
        create: {
          roleId: roleManager.id,
          actionKey: action.key,
          canTransfer: true,
          maxScope: actionSeedMap.get(action.key)?.scope ?? "DEPARTMENT",
        },
      });
    }
  }

  if (dashboardAction) {
    await prisma.menu.upsert({
      where: { key: "dashboard" },
      update: { requiredActionKey: dashboardAction.key },
      create: {
        key: "dashboard",
        label: "Dashboard",
        path: "/admin",
        requiredActionKey: dashboardAction.key,
        sortOrder: 1,
        isActive: true,
      },
    });
  }

  await prisma.legalEntity.upsert({
    where: { code: "FACEBOOK_COD" },
    update: {},
    create: {
      code: "FACEBOOK_COD",
      name: "Facebook COD",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.info("Seed completed.");
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
