import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type SeedAction = {
  key: string;
  name: string;
  namespace: string;
  scope: "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "DEPARTMENT_TREE" | "SUBORDINATES" | "SITE" | "SELF";
};

const actionDefs: SeedAction[] = [
  { key: "legal_entity.read", name: "Legal entity read", namespace: "erp", scope: "ALL" },
  { key: "legal_entity.create", name: "Legal entity create", namespace: "erp", scope: "ALL" },
  { key: "legal_entity.update", name: "Legal entity update", namespace: "erp", scope: "ALL" },
  { key: "legal_entity.delete", name: "Legal entity delete", namespace: "erp", scope: "ALL" },
  { key: "business_unit.read", name: "Business unit read", namespace: "erp", scope: "ALL" },
  { key: "business_unit.create", name: "Business unit create", namespace: "erp", scope: "ALL" },
  { key: "business_unit.update", name: "Business unit update", namespace: "erp", scope: "ALL" },
  { key: "business_unit.delete", name: "Business unit delete", namespace: "erp", scope: "ALL" },
  { key: "department.read", name: "Department read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "department.create", name: "Department create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "department.update", name: "Department update", namespace: "erp", scope: "DEPARTMENT_TREE" },
  { key: "department.delete", name: "Department delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.read", name: "Site read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.create", name: "Site create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "site.update", name: "Site update", namespace: "erp", scope: "DEPARTMENT_TREE" },
  { key: "site.delete", name: "Site delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.read", name: "User read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.create", name: "User create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "user.import", name: "User import", namespace: "erp", scope: "DEPARTMENT_TREE" },
  { key: "user.update", name: "User update", namespace: "erp", scope: "DEPARTMENT_TREE" },
  { key: "user.delete", name: "User delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.read", name: "Membership read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.create", name: "Membership create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.update", name: "Membership update", namespace: "erp", scope: "DEPARTMENT_TREE" },
  { key: "membership.delete", name: "Membership delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "membership.reporting_line.manage", name: "配置员工汇报关系", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "role.read", name: "Role read", namespace: "erp", scope: "ALL" },
  { key: "role.create", name: "Role create", namespace: "erp", scope: "ALL" },
  { key: "role.update", name: "Role update", namespace: "erp", scope: "ALL" },
  { key: "role.delete", name: "Role delete", namespace: "erp", scope: "ALL" },
  { key: "menu.read", name: "Menu read", namespace: "erp", scope: "ALL" },
  { key: "menu.create", name: "Menu create", namespace: "erp", scope: "ALL" },
  { key: "menu.update", name: "Menu update", namespace: "erp", scope: "ALL" },
  { key: "menu.delete", name: "Menu delete", namespace: "erp", scope: "ALL" },
  { key: "access_grant.read", name: "Access grant read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "access_grant.create", name: "Access grant create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "access_grant.update", name: "Access grant update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "access_grant.delete", name: "Access grant delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "delegation.manage", name: "Delegation manage", namespace: "erp", scope: "ALL" },

  { key: "dashboard.view", name: "Dashboard view", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "daily_goal.read", name: "查看今日目标", namespace: "workforce", scope: "SELF" },
  { key: "daily_goal.create", name: "设置本人今日目标", namespace: "workforce", scope: "SELF" },
  { key: "daily_goal.manage", name: "管理下属今日目标", namespace: "workforce", scope: "SUBORDINATES" },
  { key: "daily_goal.export", name: "导出今日目标", namespace: "workforce", scope: "SUBORDINATES" },
  { key: "team_goal.read", name: "查看团队目标", namespace: "workforce", scope: "BUSINESS_UNIT" },
  { key: "team_goal.manage", name: "设置团队目标", namespace: "workforce", scope: "BUSINESS_UNIT" },
  { key: "report.view", name: "查看本人统计", namespace: "report", scope: "SELF" },
  { key: "report.team.view", name: "查看团队统计", namespace: "report", scope: "SUBORDINATES" },

  { key: "customer.read", name: "Customer read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "customer.create", name: "Customer create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "customer.import", name: "Customer import", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "customer.delete", name: "Customer delete", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "product.read", name: "Product read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.create", name: "Product create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.import", name: "Product import", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.update", name: "Product update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.delete", name: "Product delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "sku.create", name: "SKU create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "sku.update", name: "SKU update", namespace: "erp", scope: "BUSINESS_UNIT" },
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
  { key: "order.review.proof.upload", name: "上传核单凭证", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.ship", name: "订单发货", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "shipment.read", name: "Shipment read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "shipment.tracking_no.view", name: "View shipment tracking number", namespace: "erp", scope: "SITE" },
  { key: "shipment.timeline.view", name: "View shipment timeline", namespace: "erp", scope: "SITE" },
  { key: "shipment.create", name: "Shipment create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "shipment.track.update", name: "Shipment track update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "shipment.followup.assign", name: "转派物流跟进任务", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "shipment.workbench.configure", name: "配置物流工作台", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics_template.read", name: "查看物流商模板", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics_template.manage", name: "配置物流商模板", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics_template.export", name: "导出物流商订单", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "expense.read", name: "Expense read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "expense.create", name: "Expense create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "expense.import", name: "Expense import", namespace: "erp", scope: "BUSINESS_UNIT" },
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

  { key: "approval.read", name: "查看审批", namespace: "erp", scope: "BUSINESS_UNIT" },
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
    key: "delegation-rules",
    label: "权限转授规则",
    path: "/admin/delegation-rules",
    requiredActionKey: "delegation.manage",
    sortOrder: 92,
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
    label: "客户档案",
    path: "/admin/customers",
    requiredActionKey: "customer.read",
    sortOrder: 100,
    isActive: true,
  },
  {
    key: "customer-history",
    label: "历史客户订单",
    path: "/admin/customer-history",
    requiredActionKey: "order.read",
    sortOrder: 105,
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
    requiredActionKey: "approval.read",
    sortOrder: 150,
    isActive: true,
  },
  {
    key: "daily-goals",
    label: "今日目标",
    path: "/admin/daily-goals",
    requiredActionKey: "daily_goal.read",
    sortOrder: 155,
    isActive: true,
  },
  {
    key: "statistics",
    label: "统计报表",
    path: "/admin/statistics",
    requiredActionKey: "report.view",
    sortOrder: 158,
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
  { key: "group-customer", label: "客户中心", path: "/admin/customers", icon: "MessagesSquare", sortOrder: 30 },
  { key: "group-product", label: "商品与库存", path: "/admin/products", icon: "Package", sortOrder: 40 },
  { key: "group-finance", label: "财务与审批", path: "/admin/expenses", icon: "WalletCards", sortOrder: 50 },
  { key: "group-workforce", label: "目标与协作", path: "/admin/daily-goals", icon: "Target", sortOrder: 55 },
  { key: "group-data", label: "数据与报表", path: "/admin/statistics", icon: "ChartNoAxesCombined", sortOrder: 58 },
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
  "customer-history": "group-customer",
  "unified-inbox": "group-customer",
  products: "group-product",
  inventory: "group-product",
  expenses: "group-finance",
  approvals: "group-finance",
  "daily-goals": "group-workforce",
  statistics: "group-data",
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

const dashboardShortcutOrder = new Map<string, number>([
  ["orders", 10],
  ["order-review", 20],
  ["shipping-workbench", 30],
  ["shipments", 40],
  ["daily-goals", 50],
  ["statistics", 55],
  ["expenses", 60],
  ["attendance", 70],
  ["leave-requests", 80],
  ["memberships", 90],
]);

async function main() {
  const countrySeed = [
    ["AT", "奥地利"], ["BE", "比利时"], ["BG", "保加利亚"], ["CH", "瑞士"], ["CZ", "捷克"], ["DE", "德国"], ["DK", "丹麦"], ["ES", "西班牙"], ["FI", "芬兰"], ["FR", "法国"], ["GB", "英国"], ["GR", "希腊"], ["HR", "克罗地亚"], ["HU", "匈牙利"], ["IE", "爱尔兰"], ["IT", "意大利"], ["LT", "立陶宛"], ["LU", "卢森堡"], ["LV", "拉脱维亚"], ["NL", "荷兰"], ["NO", "挪威"], ["PL", "波兰"], ["PT", "葡萄牙"], ["RO", "罗马尼亚"], ["SE", "瑞典"], ["SI", "斯洛文尼亚"], ["SK", "斯洛伐克"], ["US", "美国"], ["CA", "加拿大"], ["SG", "新加坡"], ["MY", "马来西亚"], ["AU", "澳大利亚"], ["NZ", "新西兰"],
  ] as const;
  await prisma.country.createMany({ data: countrySeed.map(([code, name], sortOrder) => ({ code, name, sortOrder })), skipDuplicates: true });
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
        requiredCondition: dashboardShortcutOrder.has(menu.key)
          ? { dashboardShortcut: true, shortcutOrder: dashboardShortcutOrder.get(menu.key) }
          : undefined,
      },
      create: {
        key: menu.key,
        label: menu.label,
        path: menu.path,
        requiredActionKey: menu.requiredActionKey,
        sortOrder: menu.sortOrder,
        isActive: menu.isActive,
        parentId,
        requiredCondition: dashboardShortcutOrder.has(menu.key)
          ? { dashboardShortcut: true, shortcutOrder: dashboardShortcutOrder.get(menu.key) }
          : undefined,
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
    "daily_goal.read",
    "daily_goal.create",
    "daily_goal.manage",
    "daily_goal.export",
    "team_goal.read",
    "team_goal.manage",
    "report.view",
    "report.team.view",
    "legal_entity.read",
    "business_unit.read",
    "department.read",
    "department.create",
    "department.update",
    "site.read",
    "site.create",
    "site.update",
    "user.read",
    "membership.read",
    "membership.create",
    "membership.delete",
    "membership.reporting_line.manage",
    "role.read",
    "menu.read",
    "menu.create",
    "menu.update",
    "access_grant.read",
    "access_grant.create",
    "access_grant.update",
    "access_grant.delete",
    "delegation.manage",
    "customer.read",
    "customer.create",
    "customer.import",
    "customer.delete",
    "product.read",
    "product.create",
    "product.import",
    "product.update",
    "product.delete",
    "sku.create",
    "sku.update",
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
    "shipment.followup.assign",
    "shipment.workbench.configure",
    "logistics_template.read",
    "logistics_template.manage",
    "logistics_template.export",
    "expense.read",
    "expense.create",
    "expense.import",
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
    "approval.read",
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

  // Local-only role templates for acceptance testing. Names and permissions remain data-driven.
  const roleProfiles: Array<{
    code: string;
    name: string;
    username: string;
    email: string;
    allowed: string[];
    scopes?: Partial<Record<string, SeedAction["scope"]>>;
  }> = [
    { code: "demo_sales", name: "演示销售录单员", username: "demo_sales", email: "demo.sales@local.erp", allowed: ["dashboard.view", "daily_goal.read", "daily_goal.create", "team_goal.read", "customer.read", "customer.create", "product.read", "order.read", "order.create", "order.update", "order.submit", "attachment.read", "attachment.create", "leave_request.read", "leave_request.create"], scopes: { "order.read": "SELF", "order.update": "SELF", "order.submit": "SELF" } },
    { code: "demo_reviewer", name: "演示核单员", username: "demo_reviewer", email: "demo.reviewer@local.erp", allowed: ["dashboard.view", "customer.read", "product.read", "order.read", "order.review", "order.review.proof.upload", "order.status.update", "attachment.read", "attachment.create", "approval.read", "approval.review"] },
    { code: "demo_shipping", name: "演示发货员", username: "demo_shipping", email: "demo.shipping@local.erp", allowed: ["dashboard.view", "product.read", "order.read", "order.ship", "shipment.read", "shipment.create", "shipment.track.update", "logistics_template.read", "logistics_template.export", "attachment.read", "attachment.create"] },
    { code: "demo_after_sales", name: "演示物流售后员", username: "demo_after_sales", email: "demo.after.sales@local.erp", allowed: ["dashboard.view", "customer.read", "order.read", "shipment.read", "shipment.tracking_no.view", "shipment.timeline.view", "shipment.track.update", "inbox.read", "inbox.manage", "inbox.assign", "inbox.customer.link", "attachment.read", "attachment.create"] },
    { code: "demo_finance", name: "演示财务员", username: "demo_finance", email: "demo.finance@local.erp", allowed: ["dashboard.view", "order.read", "expense.read", "expense.create", "approval.read", "approval.review"] },
    { code: "demo_hr", name: "演示人事员", username: "demo_hr", email: "demo.hr@local.erp", allowed: ["dashboard.view", "daily_goal.read", "daily_goal.manage", "team_goal.read", "user.read", "user.create", "user.import", "user.update", "membership.read", "membership.create", "membership.update", "department.read", "attendance.read", "attendance.create", "attendance.approve", "leave_request.read", "leave_request.approve", "announcement.read", "announcement.create"] },
  ];
  const demoRoles = new Map<string, { id: string }>();
  for (const profile of roleProfiles) {
    const role = await prisma.role.upsert({
      where: { code: profile.code },
      update: { name: profile.name, isSystem: false },
      create: { code: profile.code, name: profile.name, description: "本地验收演示角色", isSystem: false },
    });
    demoRoles.set(profile.code, role);
    const allowed = new Set(profile.allowed);
    allowed.add("report.view");
    if (profile.code === "demo_hr") {
      allowed.add("report.team.view");
      allowed.add("membership.reporting_line.manage");
    }
    for (const action of actions) {
      await prisma.rolePermission.upsert({
        where: { roleId_actionKey: { roleId: role.id, actionKey: action.key } },
        update: { isAllowed: allowed.has(action.key), scope: allowed.has(action.key) ? profile.scopes?.[action.key] ?? actionSeedMap.get(action.key)?.scope ?? "BUSINESS_UNIT" : "SELF" },
        create: { roleId: role.id, actionKey: action.key, scope: allowed.has(action.key) ? profile.scopes?.[action.key] ?? actionSeedMap.get(action.key)?.scope ?? "BUSINESS_UNIT" : "SELF", isAllowed: allowed.has(action.key) },
      });
    }
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
  for (const profile of roleProfiles) {
    const role = demoRoles.get(profile.code);
    if (!role) continue;
    const allowed = new Set(profile.allowed);
    for (const menu of menuList) {
      const enabled = menu.requiredActionKey ? allowed.has(menu.requiredActionKey) : false;
      await prisma.menuPermission.upsert({
        where: { menuId_roleId: { menuId: menu.id, roleId: role.id } },
        update: { isEnabled: enabled },
        create: { menuId: menu.id, roleId: role.id, isEnabled: enabled },
      });
    }
  }

  const founderPassword = await bcrypt.hash(process.env.SEED_FOUNDER_PASSWORD || "123456", 10);
  const demoPassword = await bcrypt.hash(process.env.SEED_DEMO_PASSWORD || "123456", 10);
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
  await prisma.user.update({ where: { username: "founder" }, data: { passwordHash: founderPassword, isActive: true } });
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
  const managerUser = await prisma.user.upsert({
    where: { username: "demo_manager" },
    update: { fullName: "演示业务负责人", isActive: true, passwordHash: demoPassword },
    create: {
      username: "demo_manager",
      email: "demo.manager@local.erp",
      fullName: "演示业务负责人",
      passwordHash: demoPassword,
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
  const existingManagerMembership = await prisma.membership.findFirst({
    where: { userId: managerUser.id, businessUnitId: businessUnit.id, roleId: roleManager.id, isPrimary: true },
  });
  if (!existingManagerMembership) {
    await prisma.membership.create({
      data: {
        userId: managerUser.id,
        legalEntityId: legalEntity.id,
        businessUnitId: businessUnit.id,
        departmentId: rootDepartment.id,
        siteId: site.id,
        roleId: roleManager.id,
        isPrimary: true,
        isActive: true,
        scope: "BUSINESS_UNIT",
        startedAt: new Date(),
      },
    });
  }
  for (const profile of roleProfiles) {
    const role = demoRoles.get(profile.code);
    if (!role) continue;
    const user = await prisma.user.upsert({
      where: { username: profile.username },
      update: { fullName: profile.name, email: profile.email, passwordHash: demoPassword, isActive: true },
      create: { username: profile.username, email: profile.email, fullName: profile.name, passwordHash: demoPassword, isActive: true },
    });
    const membership = await prisma.membership.findFirst({ where: { userId: user.id, businessUnitId: businessUnit.id, roleId: role.id, isPrimary: true } });
    if (!membership) {
      await prisma.membership.create({
        data: { userId: user.id, legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, departmentId: rootDepartment.id, siteId: site.id, roleId: role.id, isPrimary: true, isActive: true, scope: "BUSINESS_UNIT", startedAt: new Date() },
      });
    }
  }

  const demoSalesRole = demoRoles.get("demo_sales");
  if (!demoSalesRole) throw new Error("demo_sales role was not created");
  const demoSalesPeerUser = await prisma.user.upsert({
    where: { username: "demo_sales_peer" },
    update: { fullName: "演示销售同事", email: "demo.sales.peer@local.erp", passwordHash: demoPassword, isActive: true },
    create: { username: "demo_sales_peer", email: "demo.sales.peer@local.erp", fullName: "演示销售同事", passwordHash: demoPassword, isActive: true },
  });
  let demoSalesPeerMembership = await prisma.membership.findFirst({
    where: { userId: demoSalesPeerUser.id, businessUnitId: businessUnit.id, roleId: demoSalesRole.id, isPrimary: true },
  });
  demoSalesPeerMembership ??= await prisma.membership.create({
    data: {
      userId: demoSalesPeerUser.id,
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
      siteId: site.id,
      roleId: demoSalesRole.id,
      isPrimary: true,
      isActive: true,
      scope: "SELF",
      startedAt: new Date(),
    },
  });

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
  await prisma.contactIdentity.update({ where: { id: demoIdentity.id }, data: { displayName: "演示咨询客户" } });
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

  // A complete fictitious shipment is included so every role can verify the tracking workflow locally.
  const demoSalesUser = await prisma.user.findUniqueOrThrow({ where: { username: "demo_sales" } });
  const demoSalesMembership = await prisma.membership.findFirstOrThrow({ where: { userId: demoSalesUser.id, businessUnitId: businessUnit.id, isPrimary: true, isActive: true } });
  await prisma.order.upsert({
    where: { businessUnitId_orderNo: { businessUnitId: businessUnit.id, orderNo: "DEMO-PEER-ORDER-001" } },
    update: {
      creatorUserId: demoSalesPeerUser.id,
      ownedByMembershipId: demoSalesPeerMembership.id,
      status: "SUBMITTED",
    },
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
      siteId: site.id,
      customerId: demoCustomer.id,
      orderNo: "DEMO-PEER-ORDER-001",
      creatorUserId: demoSalesPeerUser.id,
      ownedByMembershipId: demoSalesPeerMembership.id,
      status: "SUBMITTED",
      currency: "EUR",
      productValueCents: 1999,
      codAmountCents: 1999,
      recipientName: "演示同事客户",
      recipientPhone: "+34111111111",
      recipientEmail: "peer.customer@example.com",
      recipientCountryCode: "ES",
      recipientCity: "Madrid",
      recipientAddress: "Peer Demo Street 1",
      customerWhatsapp: "+34111111111",
      paymentMethod: "COD",
    },
  });
  const demoOrder = await prisma.order.upsert({
    where: { businessUnitId_orderNo: { businessUnitId: businessUnit.id, orderNo: "DEMO-ORDER-001" } },
    update: { status: "SHIPPED", recipientEmail: "demo.customer@example.com", customerWhatsapp: "+34123456789" },
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
      siteId: site.id,
      customerId: demoCustomer.id,
      orderNo: "DEMO-ORDER-001",
      creatorUserId: demoSalesUser.id,
      ownedByMembershipId: demoSalesMembership.id,
      status: "SHIPPED",
      currency: "EUR",
      productValueCents: 2999,
      codAmountCents: 2999,
      recipientName: "Demo Customer",
      recipientPhone: "+34123456789",
      recipientEmail: "demo.customer@example.com",
      recipientCountryCode: "ES",
      recipientCity: "Madrid",
      recipientAddress: "Demo Street 1",
      customerWhatsapp: "+34123456789",
      paymentMethod: "COD",
      note: "本地虚构验收订单，不是真实客户数据",
    },
  });
  const existingDemoItem = await prisma.orderItem.findFirst({ where: { orderId: demoOrder.id, productId: demoProduct.id } });
  if (!existingDemoItem) await prisma.orderItem.create({ data: { orderId: demoOrder.id, productId: demoProduct.id, skuId: demoSku.id, productName: demoProduct.name, quantity: 1, unitPriceCents: 2999, subtotalCents: 2999 } });
  for (const draft of [
    { orderNo: "DEMO-ORDER-002", status: "SUBMITTED" as const, recipientName: "Demo Review Customer" },
    { orderNo: "DEMO-ORDER-003", status: "WAITING_SHIPMENT" as const, recipientName: "Demo Shipping Customer" },
  ]) {
    const order = await prisma.order.upsert({
      where: { businessUnitId_orderNo: { businessUnitId: businessUnit.id, orderNo: draft.orderNo } },
      update: { status: draft.status, recipientName: draft.recipientName },
      create: { legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, departmentId: rootDepartment.id, siteId: site.id, customerId: demoCustomer.id, orderNo: draft.orderNo, creatorUserId: demoSalesUser.id, ownedByMembershipId: demoSalesMembership.id, status: draft.status, currency: "EUR", productValueCents: 2999, codAmountCents: 2999, recipientName: draft.recipientName, recipientPhone: "+34123456780", recipientEmail: `${draft.orderNo.toLowerCase()}@example.com`, recipientCountryCode: "ES", recipientCity: "Madrid", recipientAddress: "Demo Street 2", customerWhatsapp: "+34123456780", paymentMethod: "COD" },
    });
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id, productId: demoProduct.id } });
    if (!item) await prisma.orderItem.create({ data: { orderId: order.id, productId: demoProduct.id, skuId: demoSku.id, productName: demoProduct.name, quantity: 1, unitPriceCents: 2999, subtotalCents: 2999 } });
  }
  const demoAfterSalesUser = await prisma.user.findUniqueOrThrow({ where: { username: "demo_after_sales" } });
  const demoAfterSalesMembership = await prisma.membership.findFirstOrThrow({ where: { userId: demoAfterSalesUser.id, businessUnitId: businessUnit.id, isPrimary: true, isActive: true } });
  const demoShipment = await prisma.shipment.upsert({
    where: { id: "00000000-0000-4000-8000-000000000201" },
    update: { status: "IN_TRANSIT", trackingNo: "DEMO-TRACK-001", ownerMembershipId: demoAfterSalesMembership.id, workStatus: "NEEDS_ATTENTION" },
    create: { id: "00000000-0000-4000-8000-000000000201", orderId: demoOrder.id, legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, siteId: site.id, carrier: "DEMO CARRIER", trackingNo: "DEMO-TRACK-001", status: "IN_TRANSIT", shippedAt: new Date(), ownerMembershipId: demoAfterSalesMembership.id, workStatus: "NEEDS_ATTENTION", lastTrackedAt: new Date() },
  });
  const waitingShipmentOrder = await prisma.order.findUniqueOrThrow({ where: { businessUnitId_orderNo: { businessUnitId: businessUnit.id, orderNo: "DEMO-ORDER-003" } } });
  await prisma.shipment.upsert({
    where: { id: "00000000-0000-4000-8000-000000000202" },
    update: { orderId: waitingShipmentOrder.id, status: "PENDING", trackingNo: null, workStatus: "MONITORING" },
    create: { id: "00000000-0000-4000-8000-000000000202", orderId: waitingShipmentOrder.id, legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, siteId: site.id, carrier: "DEMO CARRIER", status: "PENDING", workStatus: "MONITORING" },
  });
  const demoEvent = await prisma.shipmentEvent.upsert({
    where: { shipmentId_source_externalEventKey: { shipmentId: demoShipment.id, source: "DEMO", externalEventKey: "demo-event-001" } },
    update: { memo: "包裹正在运输中，请及时联系客户确认收货安排。", location: "Madrid", eventType: "IN_TRANSIT" },
    create: { shipmentId: demoShipment.id, source: "DEMO", externalEventKey: "demo-event-001", eventType: "IN_TRANSIT", statusMilestone: "IN_TRANSIT", location: "Madrid", memo: "包裹正在运输中，请及时联系客户确认收货安排。", actorMembershipId: demoAfterSalesMembership.id },
  });
  await prisma.logisticsEventAnnotation.upsert({ where: { shipmentEventId: demoEvent.id }, update: { note: "演示：已提醒客户保持电话畅通", tags: ["已通知客户", "演示"], isHandled: false }, create: { shipmentId: demoShipment.id, shipmentEventId: demoEvent.id, businessUnitId: businessUnit.id, note: "演示：已提醒客户保持电话畅通", tags: ["已通知客户", "演示"] } });

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
