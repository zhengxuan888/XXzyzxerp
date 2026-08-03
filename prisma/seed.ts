import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { defaultDashboardWorkbenchConfig } from "../src/lib/dashboard-workbench-config";

const prisma = new PrismaClient();

type SeedAction = {
  key: string;
  name: string;
  namespace: string;
  scope: "ALL" | "BUSINESS_UNIT" | "DEPARTMENT" | "DEPARTMENT_TREE" | "SUBORDINATES" | "SITE" | "SELF";
};

const actionDefs: SeedAction[] = [
  { key: "system.configuration.manage", name: "System configuration manage", namespace: "system", scope: "ALL" },
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
  { key: "dashboard.configure", name: "Configure dashboard workbench", namespace: "erp", scope: "BUSINESS_UNIT" },
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
  { key: "product.export", name: "Product export", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.update", name: "Product update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "product.delete", name: "Product delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "sku.create", name: "SKU create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "sku.update", name: "SKU update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "inventory.read", name: "Inventory read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "inventory.adjust", name: "Inventory adjust", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order_template.read", name: "Order template read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order_template.manage", name: "Order template manage", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.numbering.read", name: "查看订单编号规则", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.numbering.manage", name: "配置订单编号规则", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "order.read", name: "Order read", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.create", name: "Order create", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.update", name: "Order update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.delete", name: "Order delete", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.status.update", name: "Order status update", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.submit", name: "提交订单核单", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.review", name: "订单核单工作台与领取", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.review.approve", name: "核单通过", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.review.reject", name: "核单退回", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.review.proof.upload", name: "上传核单凭证", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "order.void", name: "作废订单", namespace: "erp", scope: "BUSINESS_UNIT" },
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
  { key: "logistics.export_batch.read", name: "查看物流导出批次", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics.export_batch.create", name: "创建物流导出批次", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics.export_batch.dispatch", name: "标记物流商已接收", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics.return_import.preview", name: "预检物流商回传", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics.return_import.confirm", name: "确认物流商回传", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "logistics.batch_artifact.read", name: "下载物流批次原文件", namespace: "erp", scope: "BUSINESS_UNIT" },

  { key: "finance.counterparty.read", name: "查看结算对象", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.counterparty.manage", name: "管理结算对象", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement.read", name: "查看物流商结算与 COD 回款", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement.create", name: "创建结算单", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement.update", name: "编辑结算单草稿", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.reconciliation.read", name: "查看对账明细", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.reconciliation.match", name: "创建人工匹配建议", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.reconciliation.resolve", name: "处理对账差异", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.settlement.approve", name: "批准结算单", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.settlement.post", name: "结算单过账", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.settlement.void", name: "作废结算单", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.payment.read", name: "查看付款与核销", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.payment.create", name: "创建付款草稿", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.payment.approve", name: "批准付款", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.payment.post", name: "付款过账", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.payment.void", name: "作废付款", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.payment.allocate", name: "付款核销", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.allocation_adjustment.read", name: "查看核销调整", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.allocation_adjustment.request", name: "申请核销调整", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.allocation_adjustment.approve", name: "审核核销调整", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.allocation_adjustment.apply", name: "执行核销调整", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.allocation_adjustment.cancel", name: "取消核销调整", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.pii.read", name: "查看财务敏感字段", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement_template.read", name: "查看账单模板", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement_template.manage", name: "管理账单模板", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement_import.read", name: "查看账单导入预检", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement_import.preview", name: "预检账单导入", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement_import.confirm", name: "确认账单导入", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement_import.cancel", name: "取消账单预检", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.statement_artifact.read", name: "下载账单原件", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.control_policy.read", name: "查看财务内控规则", namespace: "finance", scope: "BUSINESS_UNIT" },
  { key: "finance.control_policy.manage", name: "配置财务内控规则", namespace: "finance", scope: "BUSINESS_UNIT" },

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
  { key: "document.review", name: "Document review", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "document.archive", name: "Document archive", namespace: "erp", scope: "BUSINESS_UNIT" },
  { key: "document.category.configure", name: "Configure document categories", namespace: "erp", scope: "BUSINESS_UNIT" },

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
  { key: "resource.read", name: "查看资源台账", namespace: "resource", scope: "BUSINESS_UNIT" },
  { key: "resource.create", name: "新建资源台账", namespace: "resource", scope: "BUSINESS_UNIT" },
  { key: "resource.update", name: "编辑资源台账", namespace: "resource", scope: "BUSINESS_UNIT" },
  { key: "resource.lifecycle.manage", name: "处理资源流转", namespace: "resource", scope: "BUSINESS_UNIT" },
  { key: "resource.lifecycle.history.read", name: "查看资源完整流转历史", namespace: "resource", scope: "BUSINESS_UNIT" },
  { key: "resource.archive", name: "归档资源", namespace: "resource", scope: "BUSINESS_UNIT" },
  { key: "resource.configure", name: "配置资源分类和流转规则", namespace: "resource", scope: "BUSINESS_UNIT" },
  { key: "software_asset.account.read", name: "查看软件账号标识", namespace: "resource", scope: "BUSINESS_UNIT" },
  { key: "software_asset.account.manage", name: "登记或修改软件账号标识", namespace: "resource", scope: "BUSINESS_UNIT" },
  // Stable capabilities only: labels, roles, source trees and KPI definitions
  // remain data that an authorized administrator can configure at runtime.
  { key: "marketing.workbench.view", name: "查看投放运营工作台", namespace: "marketing", scope: "SELF" },
  { key: "marketing.workbench.configure", name: "配置投放运营工作台", namespace: "marketing", scope: "BUSINESS_UNIT" },
  { key: "marketing.source.read", name: "查看投放数据源", namespace: "marketing", scope: "BUSINESS_UNIT" },
  { key: "marketing.source.manage", name: "配置投放数据源", namespace: "marketing", scope: "BUSINESS_UNIT" },
  { key: "marketing.metric.read", name: "查看投放指标定义", namespace: "marketing", scope: "BUSINESS_UNIT" },
  { key: "marketing.metric.manage", name: "配置投放指标定义", namespace: "marketing", scope: "BUSINESS_UNIT" },
  { key: "marketing.report.read", name: "查看投放日报", namespace: "marketing", scope: "SELF" },
  { key: "marketing.report.create", name: "创建投放日报", namespace: "marketing", scope: "SELF" },
  { key: "marketing.report.update", name: "编辑投放日报", namespace: "marketing", scope: "SELF" },
  { key: "marketing.report.submit", name: "提交投放日报", namespace: "marketing", scope: "SELF" },
  { key: "marketing.report.review", name: "审核投放日报", namespace: "marketing", scope: "SUBORDINATES" },
  { key: "marketing.report.export", name: "导出投放日报", namespace: "marketing", scope: "SUBORDINATES" },
  { key: "marketing.kpi.read", name: "查看投放 KPI", namespace: "marketing", scope: "SELF" },
  { key: "marketing.kpi.manage", name: "配置投放 KPI", namespace: "marketing", scope: "SUBORDINATES" },
  { key: "marketing.creative.read", name: "查看投放素材", namespace: "marketing", scope: "DEPARTMENT" },
  { key: "marketing.creative.create", name: "创建投放素材", namespace: "marketing", scope: "SELF" },
  { key: "marketing.creative.update", name: "编辑投放素材", namespace: "marketing", scope: "SELF" },
  { key: "marketing.creative.archive", name: "归档投放素材", namespace: "marketing", scope: "SUBORDINATES" },
  { key: "marketing.creative.tag.manage", name: "配置投放素材标签", namespace: "marketing", scope: "DEPARTMENT" },
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
    requiredActionKey: "system.configuration.manage",
    sortOrder: 70,
    isActive: true,
  },
  {
    key: "menus",
    label: "菜单管理",
    path: "/admin/menus",
    requiredActionKey: "system.configuration.manage",
    sortOrder: 80,
    isActive: true,
  },
  {
    key: "integrations",
    label: "第三方接口",
    path: "/admin/integrations",
    requiredActionKey: "shipment.workbench.configure",
    sortOrder: 85,
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
    requiredActionKey: "system.configuration.manage",
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
    key: "order-numbering",
    label: "订单编号规则",
    path: "/admin/order-numbering",
    requiredActionKey: "order.numbering.read",
    sortOrder: 119,
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
    key: "finance-settlements",
    label: "物流回款与结算",
    path: "/admin/finance-settlements",
    requiredActionKey: "finance.statement.read",
    sortOrder: 145,
    isActive: true,
  },
  {
    key: "finance-statement-imports",
    label: "账单模板与导入",
    path: "/admin/finance-imports",
    requiredActionKey: "finance.statement_import.read",
    sortOrder: 146,
    isActive: true,
  },
  {
    key: "finance-controls",
    label: "财务内控",
    path: "/admin/finance-controls",
    requiredActionKey: "finance.control_policy.read",
    sortOrder: 147,
    isActive: true,
  },
  {
    key: "finance-allocation-adjustments",
    label: "核销调整",
    path: "/admin/finance-allocation-adjustments",
    requiredActionKey: "finance.allocation_adjustment.read",
    sortOrder: 148,
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
    key: "marketing-workbench",
    label: "投放运营工作台",
    path: "/admin/marketing",
    requiredActionKey: "marketing.workbench.view",
    sortOrder: 152,
    isActive: true,
  },
  {
    key: "marketing-reports",
    label: "投放日报",
    path: "/admin/marketing/reports",
    requiredActionKey: "marketing.report.read",
    sortOrder: 153,
    isActive: true,
  },
  {
    key: "marketing-kpis",
    label: "投放绩效指标",
    path: "/admin/marketing/kpis",
    requiredActionKey: "marketing.kpi.read",
    sortOrder: 154,
    isActive: true,
  },
  {
    key: "marketing-creatives",
    label: "素材中心",
    path: "/admin/marketing/creatives",
    requiredActionKey: "marketing.creative.read",
    sortOrder: 155,
    isActive: true,
  },
  {
    key: "marketing-settings",
    label: "投放配置",
    path: "/admin/marketing/settings",
    requiredActionKey: "marketing.workbench.configure",
    sortOrder: 156,
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
  {
    key: "resources",
    label: "资源中心",
    path: "/admin/resources",
    requiredActionKey: "resource.read",
    sortOrder: 195,
    isActive: true,
  },
  {
    key: "software-assets",
    label: "软件资产",
    path: "/admin/software-assets",
    requiredActionKey: "resource.read",
    sortOrder: 196,
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
  { key: "group-marketing", label: "投放运营", path: "/admin/marketing", icon: "Megaphone", sortOrder: 57 },
] as const;

const menuGroupByKey: Record<string, (typeof menuGroupDefs)[number]["key"]> = {
  orders: "group-sales",
  "order-review": "group-sales",
  "order-templates": "group-sales",
  "order-numbering": "group-sales",
  "shipping-workbench": "group-logistics",
  shipments: "group-logistics",
  customers: "group-customer",
  "customer-history": "group-customer",
  "unified-inbox": "group-customer",
  products: "group-product",
  inventory: "group-product",
  expenses: "group-finance",
  "finance-settlements": "group-finance",
  "finance-statement-imports": "group-finance",
  "finance-controls": "group-finance",
  "finance-allocation-adjustments": "group-finance",
  approvals: "group-finance",
  "daily-goals": "group-workforce",
  "marketing-workbench": "group-marketing",
  "marketing-reports": "group-marketing",
  "marketing-kpis": "group-marketing",
  "marketing-creatives": "group-marketing",
  "marketing-settings": "group-marketing",
  statistics: "group-data",
  attendance: "group-hr",
  "leave-requests": "group-hr",
  announcements: "group-hr",
  documents: "group-hr",
  resources: "group-hr",
  "software-assets": "group-hr",
  organizations: "group-organization",
  "business-units": "group-organization",
  departments: "group-organization",
  sites: "group-organization",
  users: "group-organization",
  memberships: "group-organization",
  roles: "group-organization",
  "access-grants": "group-organization",
  menus: "group-system",
  integrations: "group-system",
};

const dashboardShortcutOrder = new Map<string, number>([
  ["orders", 10],
  ["order-review", 20],
  ["shipping-workbench", 30],
  ["shipments", 40],
  ["daily-goals", 50],
  ["marketing-workbench", 52],
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

  await prisma.dashboardWorkbenchSetting.upsert({
    where: { businessUnitId: businessUnit.id },
    update: {},
    create: {
      businessUnitId: businessUnit.id,
      cards: defaultDashboardWorkbenchConfig.cards as unknown as Prisma.InputJsonValue,
    },
  });

  // These are only replaceable example categories. The application always
  // reads categories from the database, so new business units never require a
  // code change to add or retire document classifications.
  for (const [code, name, sortOrder] of [
    ["POLICY", "制度与流程", 10],
    ["TRAINING", "培训资料", 20],
    ["CONTRACT", "合同与协议", 30],
    ["OPERATIONS", "运营资料", 40],
  ] as const) {
    await prisma.documentCategory.upsert({
      where: { businessUnitId_code: { businessUnitId: businessUnit.id, code } },
      update: { name, sortOrder, isActive: true },
      create: { legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, code, name, sortOrder },
    });
  }

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
    "product.export",
    "product.update",
    "product.delete",
    "sku.create",
    "sku.update",
    "inventory.read",
    "inventory.adjust",
    "order_template.read",
    "order_template.manage",
    "order.numbering.read",
    "order.numbering.manage",
    "order.read",
    "order.create",
    "order.update",
    "order.delete",
    "order.status.update",
    "order.submit",
    "order.review",
    "order.review.approve",
    "order.review.reject",
    "order.review.proof.upload",
    "order.void",
    "order.ship",
    "shipment.read",
    "shipment.create",
    "shipment.track.update",
    "shipment.followup.assign",
    "logistics_template.read",
    "logistics_template.manage",
    "logistics_template.export",
    "logistics.export_batch.read",
    "logistics.export_batch.create",
    "logistics.export_batch.dispatch",
    "logistics.return_import.preview",
    "logistics.return_import.confirm",
    "logistics.batch_artifact.read",
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
    "document.review",
    "document.archive",
    "document.category.configure",
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
    "resource.read",
    "resource.create",
    "resource.update",
    "resource.lifecycle.manage",
    "resource.lifecycle.history.read",
    "resource.archive",
    "resource.configure",
    "software_asset.account.read",
    "software_asset.account.manage",
    "marketing.workbench.view",
    "marketing.workbench.configure",
    "marketing.source.read",
    "marketing.source.manage",
    "marketing.metric.read",
    "marketing.metric.manage",
    "marketing.report.read",
    "marketing.report.create",
    "marketing.report.update",
    "marketing.report.submit",
    "marketing.report.review",
    "marketing.report.export",
    "marketing.kpi.read",
    "marketing.kpi.manage",
    "marketing.creative.read",
    "marketing.creative.create",
    "marketing.creative.update",
    "marketing.creative.archive",
    "marketing.creative.tag.manage",
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
    { code: "demo_sales", name: "演示销售录单员", username: "demo_sales", email: "demo.sales@local.erp", allowed: ["dashboard.view", "daily_goal.read", "daily_goal.create", "team_goal.read", "customer.read", "customer.create", "product.read", "order.read", "order.create", "order.update", "order.submit", "document.read", "document.create", "attachment.read", "attachment.create", "leave_request.read", "leave_request.create"], scopes: { "order.read": "SELF", "order.update": "SELF", "order.submit": "SELF", "document.read": "SELF", "document.create": "SELF" } },
    { code: "demo_reviewer", name: "演示核单员", username: "demo_reviewer", email: "demo.reviewer@local.erp", allowed: ["dashboard.view", "customer.read", "product.read", "order.read", "order.review", "order.review.approve", "order.review.reject", "order.review.proof.upload", "order.void", "attachment.read", "attachment.create", "approval.read", "approval.review"] },
    { code: "demo_shipping", name: "演示发货员", username: "demo_shipping", email: "demo.shipping@local.erp", allowed: ["dashboard.view", "product.read", "order.read", "order.ship", "shipment.read", "shipment.create", "shipment.track.update", "logistics_template.read", "logistics_template.export", "logistics.export_batch.read", "logistics.export_batch.create", "logistics.export_batch.dispatch", "logistics.return_import.preview", "logistics.return_import.confirm", "logistics.batch_artifact.read", "attachment.read", "attachment.create"] },
    { code: "demo_after_sales", name: "演示物流售后员", username: "demo_after_sales", email: "demo.after.sales@local.erp", allowed: ["dashboard.view", "customer.read", "order.read", "shipment.read", "shipment.tracking_no.view", "shipment.timeline.view", "shipment.track.update", "inbox.read", "inbox.manage", "inbox.assign", "inbox.customer.link", "attachment.read", "attachment.create"] },
    { code: "demo_finance", name: "演示财务员", username: "demo_finance", email: "demo.finance@local.erp", allowed: ["dashboard.view", "order.read", "expense.read", "expense.create", "approval.read", "approval.review"] },
    { code: "demo_hr", name: "演示人事员", username: "demo_hr", email: "demo.hr@local.erp", allowed: ["dashboard.view", "daily_goal.read", "daily_goal.manage", "team_goal.read", "user.read", "user.create", "user.import", "user.update", "membership.read", "membership.create", "membership.update", "department.read", "attendance.read", "attendance.create", "attendance.approve", "leave_request.read", "leave_request.approve", "announcement.read", "announcement.create", "document.read", "document.create", "document.review", "document.archive", "document.category.configure", "resource.read", "resource.create", "resource.update", "resource.lifecycle.manage", "resource.lifecycle.history.read", "resource.archive", "resource.configure", "software_asset.account.read", "software_asset.account.manage"] },
    {
      code: "demo_marketing_operator",
      name: "演示投放专员",
      username: "demo_marketing_operator",
      email: "demo.marketing.operator@local.erp",
      allowed: [
        "dashboard.view",
        "marketing.workbench.view",
        "marketing.source.read",
        "marketing.metric.read",
        "marketing.report.read",
        "marketing.report.create",
        "marketing.report.update",
        "marketing.report.submit",
        "marketing.kpi.read",
        "marketing.creative.read",
        "marketing.creative.create",
        "marketing.creative.update",
        "attachment.read",
        "attachment.create",
      ],
      scopes: {
        "marketing.report.read": "SELF",
        "marketing.report.update": "SELF",
        "marketing.kpi.read": "SELF",
        "marketing.creative.read": "DEPARTMENT",
        "marketing.creative.update": "SELF",
      },
    },
    {
      code: "demo_marketing_manager",
      name: "演示投放主管",
      username: "demo_marketing_manager",
      email: "demo.marketing.manager@local.erp",
      allowed: [
        "dashboard.view",
        "marketing.workbench.view",
        "marketing.workbench.configure",
        "marketing.source.read",
        "marketing.source.manage",
        "marketing.metric.read",
        "marketing.metric.manage",
        "marketing.report.read",
        "marketing.report.create",
        "marketing.report.update",
        "marketing.report.submit",
        "marketing.report.review",
        "marketing.report.export",
        "marketing.kpi.read",
        "marketing.kpi.manage",
        "marketing.creative.read",
        "marketing.creative.create",
        "marketing.creative.update",
        "marketing.creative.archive",
        "marketing.creative.tag.manage",
        "attachment.read",
        "attachment.create",
        "attachment.delete",
      ],
      scopes: {
        "marketing.report.read": "DEPARTMENT_TREE",
        "marketing.report.review": "SUBORDINATES",
        "marketing.report.export": "SUBORDINATES",
        "marketing.kpi.read": "DEPARTMENT_TREE",
        "marketing.kpi.manage": "DEPARTMENT_TREE",
        "marketing.creative.read": "DEPARTMENT_TREE",
        "marketing.creative.update": "DEPARTMENT_TREE",
        "marketing.creative.archive": "DEPARTMENT_TREE",
      },
    },
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

  // Local-only marketing examples. They are deliberately generic and
  // replaceable: runtime code reads these records rather than branching on a
  // platform, team name, or demo role.
  const marketingManagerRole = demoRoles.get("demo_marketing_manager");
  const marketingOperatorRole = demoRoles.get("demo_marketing_operator");
  const marketingManagerMembership = marketingManagerRole
    ? await prisma.membership.findFirst({
        where: { businessUnitId: businessUnit.id, roleId: marketingManagerRole.id, user: { username: "demo_marketing_manager" }, isPrimary: true },
      })
    : null;
  const marketingOperatorMembership = marketingOperatorRole
    ? await prisma.membership.findFirst({
        where: { businessUnitId: businessUnit.id, roleId: marketingOperatorRole.id, user: { username: "demo_marketing_operator" }, isPrimary: true },
      })
    : null;
  if (marketingManagerMembership && marketingOperatorMembership) {
    await prisma.membership.update({
      where: { id: marketingOperatorMembership.id },
      data: { managerMembershipId: marketingManagerMembership.id },
    });
  }

  const marketingSource = await prisma.marketingSource.upsert({
    where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "DEMO_MANUAL_SOURCE" } },
    update: { name: "演示手工投放来源", kind: "SOURCE", isActive: true, sortOrder: 10 },
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      departmentId: rootDepartment.id,
      siteId: site.id,
      code: "DEMO_MANUAL_SOURCE",
      name: "演示手工投放来源",
      kind: "SOURCE",
      sortOrder: 10,
    },
  });
  const metricSeeds: Array<{
    code: string;
    name: string;
    valueType: "COUNT" | "MONEY_CENTS" | "DECIMAL" | "PERCENT";
    calculation?: "DIRECT" | "RATIO";
    numeratorMetricCode?: string;
    denominatorMetricCode?: string;
    multiplier?: Prisma.Decimal;
    inputRequired?: boolean;
    showOnWorkbench?: boolean;
    sortOrder: number;
  }> = [
    { code: "SPEND", name: "投放花费", valueType: "MONEY_CENTS", inputRequired: true, showOnWorkbench: true, sortOrder: 10 },
    { code: "REVENUE", name: "投放收入", valueType: "MONEY_CENTS", inputRequired: true, showOnWorkbench: true, sortOrder: 20 },
    { code: "IMPRESSIONS", name: "展示次数", valueType: "COUNT", inputRequired: true, sortOrder: 30 },
    { code: "CLICKS", name: "点击次数", valueType: "COUNT", inputRequired: true, sortOrder: 40 },
    { code: "CONVERSIONS", name: "转化次数", valueType: "COUNT", inputRequired: true, showOnWorkbench: true, sortOrder: 50 },
    { code: "CREATIVE_COUNT", name: "使用素材数", valueType: "COUNT", inputRequired: true, sortOrder: 60 },
    { code: "ROAS", name: "ROAS", valueType: "DECIMAL", calculation: "RATIO", numeratorMetricCode: "REVENUE", denominatorMetricCode: "SPEND", multiplier: new Prisma.Decimal(1), showOnWorkbench: true, sortOrder: 70 },
    { code: "CPA", name: "单次转化成本", valueType: "MONEY_CENTS", calculation: "RATIO", numeratorMetricCode: "SPEND", denominatorMetricCode: "CONVERSIONS", multiplier: new Prisma.Decimal(1), showOnWorkbench: true, sortOrder: 80 },
    { code: "CTR", name: "点击率", valueType: "PERCENT", calculation: "RATIO", numeratorMetricCode: "CLICKS", denominatorMetricCode: "IMPRESSIONS", multiplier: new Prisma.Decimal(100), showOnWorkbench: true, sortOrder: 90 },
  ];
  for (const metric of metricSeeds) {
    await prisma.marketingMetricDefinition.upsert({
      where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: metric.code } },
      update: { ...metric, isActive: true },
      create: { legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, ...metric },
    });
  }
  // This is an editable first-run layout only. Runtime workbench rendering
  // reads the database record and validates every action/metric again.
  await prisma.marketingWorkbenchSetting.upsert({
    where: { businessUnitId: businessUnit.id },
    update: {},
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      updatedByUserId: founderUser.id,
      cards: [
        { key: "report-entry", kind: "QUICK_ACTION", label: "填写日报", description: "记录今天的原始投放数据，系统自动计算比率指标。", isVisible: true, zone: "FOCUS", sortOrder: 10, audience: { roleIds: [], departmentIds: [], membershipIds: [] }, metricCode: null, queueKey: null, actionKey: "marketing.report.create", href: "/admin/marketing/reports?create=1" },
        { key: "my-draft-reports", kind: "QUEUE", label: "待完成日报", description: "继续填写自己的草稿日报。", isVisible: true, zone: "FOCUS", sortOrder: 20, audience: { roleIds: [], departmentIds: [], membershipIds: [] }, metricCode: null, queueKey: "MY_DRAFT_REPORTS", actionKey: "marketing.report.read", href: "/admin/marketing/reports?status=DRAFT" },
        { key: "returned-reports", kind: "QUEUE", label: "退回待修改", description: "处理被退回的日报并重新提交。", isVisible: true, zone: "FOCUS", sortOrder: 30, audience: { roleIds: [], departmentIds: [], membershipIds: [] }, metricCode: null, queueKey: "RETURNED_REPORTS", actionKey: "marketing.report.read", href: "/admin/marketing/reports?status=RETURNED" },
        { key: "today-spend", kind: "METRIC", label: "今日花费", description: "当前日期、当前币种范围内的投放花费。", isVisible: true, zone: "OVERVIEW", sortOrder: 40, audience: { roleIds: [], departmentIds: [], membershipIds: [] }, metricCode: "SPEND", queueKey: null, actionKey: "marketing.report.read", href: null },
        { key: "today-revenue", kind: "METRIC", label: "今日收入", description: "当前日期、当前币种范围内的投放收入。", isVisible: true, zone: "OVERVIEW", sortOrder: 50, audience: { roleIds: [], departmentIds: [], membershipIds: [] }, metricCode: "REVENUE", queueKey: null, actionKey: "marketing.report.read", href: null },
        { key: "today-roas", kind: "METRIC", label: "ROAS", description: "基于原始收入与花费自动计算。", isVisible: true, zone: "OVERVIEW", sortOrder: 60, audience: { roleIds: [], departmentIds: [], membershipIds: [] }, metricCode: "ROAS", queueKey: null, actionKey: "marketing.report.read", href: null },
        { key: "kpi-overview", kind: "QUICK_ACTION", label: "团队与 KPI", description: "查看当前授权范围内的目标、实际与达成情况。", isVisible: true, zone: "QUICK", sortOrder: 70, audience: { roleIds: [], departmentIds: [], membershipIds: [] }, metricCode: null, queueKey: null, actionKey: "marketing.kpi.read", href: "/admin/marketing/kpis" },
        { key: "creative-library", kind: "QUICK_ACTION", label: "素材中心", description: "查找、上传、标注并管理投放素材。", isVisible: true, zone: "QUICK", sortOrder: 80, audience: { roleIds: [], departmentIds: [], membershipIds: [] }, metricCode: null, queueKey: null, actionKey: "marketing.creative.read", href: "/admin/marketing/creatives" },
      ],
    },
  });
  for (const [code, name, color, isTerminal, sortOrder] of [
    ["DRAFT", "草稿", "slate", false, 10],
    ["IN_REVIEW", "审核中", "gold", false, 20],
    ["ACTIVE", "投放中", "emerald", false, 30],
    ["PAUSED", "已暂停", "amber", false, 40],
    ["RETIRED", "已淘汰", "gray", true, 50],
  ] as const) {
    await prisma.marketingCreativeStatus.upsert({
      where: { businessUnitId_code: { businessUnitId: businessUnit.id, code } },
      update: { name, color, isTerminal, isActive: true, sortOrder },
      create: { legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, code, name, color, isTerminal, sortOrder },
    });
  }
  for (const [name, color, sortOrder] of [
    ["新品测试", "gold", 10],
    ["待优化", "orange", 20],
    ["高潜力", "emerald", 30],
    ["需复盘", "slate", 40],
  ] as const) {
    await prisma.marketingTag.upsert({
      where: { businessUnitId_name: { businessUnitId: businessUnit.id, name } },
      update: { color, sortOrder, isActive: true },
      create: { legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, name, color, sortOrder },
    });
  }
  if (marketingOperatorMembership) {
    const demoReportDate = new Date();
    demoReportDate.setUTCHours(0, 0, 0, 0);
    const report = await prisma.marketingDailyReport.upsert({
      where: {
        businessUnitId_ownerMembershipId_sourceId_reportDate: {
          businessUnitId: businessUnit.id,
          ownerMembershipId: marketingOperatorMembership.id,
          sourceId: marketingSource.id,
          reportDate: demoReportDate,
        },
      },
      update: { status: "SUBMITTED", submittedAt: new Date(), note: "本地演示日报，仅用于验收。" },
      create: {
        legalEntityId: legalEntity.id,
        businessUnitId: businessUnit.id,
        departmentId: marketingOperatorMembership.departmentId,
        siteId: marketingOperatorMembership.siteId,
        sourceId: marketingSource.id,
        ownerMembershipId: marketingOperatorMembership.id,
        createdByUserId: marketingOperatorMembership.userId,
        reportDate: demoReportDate,
        currency: "EUR",
        status: "SUBMITTED",
        submittedAt: new Date(),
        note: "本地演示日报，仅用于验收。",
      },
    });
    const metricMap = new Map((await prisma.marketingMetricDefinition.findMany({ where: { businessUnitId: businessUnit.id } })).map((metric) => [metric.code, metric]));
    for (const [metricCode, valueCents, valueDecimal] of [
      ["SPEND", BigInt("12500"), null],
      ["REVENUE", BigInt("42000"), null],
      ["IMPRESSIONS", null, new Prisma.Decimal(12500)],
      ["CLICKS", null, new Prisma.Decimal(620)],
      ["CONVERSIONS", null, new Prisma.Decimal(14)],
      ["CREATIVE_COUNT", null, new Prisma.Decimal(3)],
    ] as const) {
      const metric = metricMap.get(metricCode);
      if (!metric) continue;
      await prisma.marketingDailyMetricValue.upsert({
        where: { reportId_metricDefinitionId: { reportId: report.id, metricDefinitionId: metric.id } },
        update: { valueCents, valueDecimal },
        create: { reportId: report.id, metricDefinitionId: metric.id, valueCents, valueDecimal },
      });
    }
  }
  if (marketingManagerMembership && marketingOperatorMembership) {
    const spendMetric = await prisma.marketingMetricDefinition.findUnique({
      where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "SPEND" } },
    });
    if (spendMetric) {
      const periodStart = new Date();
      periodStart.setUTCDate(1);
      periodStart.setUTCHours(0, 0, 0, 0);
      const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0));
      await prisma.marketingKpiTarget.upsert({
        where: {
          businessUnitId_metricDefinitionId_scopeType_scopeKey_periodStart_periodEnd: {
            businessUnitId: businessUnit.id,
            metricDefinitionId: spendMetric.id,
            scopeType: "MEMBERSHIP",
            scopeKey: marketingOperatorMembership.id,
            periodStart,
            periodEnd,
          },
        },
        update: { targetCents: BigInt("30000"), targetDecimal: null, currency: "EUR", setByMembershipId: marketingManagerMembership.id },
        create: {
          legalEntityId: legalEntity.id,
          businessUnitId: businessUnit.id,
          departmentId: marketingOperatorMembership.departmentId,
          targetMembershipId: marketingOperatorMembership.id,
          metricDefinitionId: spendMetric.id,
          scopeType: "MEMBERSHIP",
          scopeKey: marketingOperatorMembership.id,
          periodStart,
          periodEnd,
          targetCents: BigInt("30000"),
          currency: "EUR",
          setByMembershipId: marketingManagerMembership.id,
        },
      });
    }
    const activeStatus = await prisma.marketingCreativeStatus.findUnique({
      where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "ACTIVE" } },
    });
    if (activeStatus) {
      const creative = await prisma.marketingCreative.upsert({
        where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "DEMO-CREATIVE-001" } },
        update: { name: "演示素材：产品卖点短视频", statusId: activeStatus.id, isArchived: false },
        create: {
          legalEntityId: legalEntity.id,
          businessUnitId: businessUnit.id,
          departmentId: marketingOperatorMembership.departmentId,
          siteId: marketingOperatorMembership.siteId,
          sourceId: marketingSource.id,
          statusId: activeStatus.id,
          ownerMembershipId: marketingOperatorMembership.id,
          createdByUserId: marketingOperatorMembership.userId,
          code: "DEMO-CREATIVE-001",
          name: "演示素材：产品卖点短视频",
          description: "本地演示记录；上传真实素材后可直接预览、打标签和归档。",
        },
      });
      const highPotentialTag = await prisma.marketingTag.findUnique({
        where: { businessUnitId_name: { businessUnitId: businessUnit.id, name: "高潜力" } },
      });
      if (highPotentialTag) {
        await prisma.marketingCreativeTag.upsert({
          where: { creativeId_tagId: { creativeId: creative.id, tagId: highPotentialTag.id } },
          update: {},
          create: { creativeId: creative.id, tagId: highPotentialTag.id },
        });
      }
    }
  }

  // Create a strict default without overwriting a business unit's later
  // authorized configuration. This remains seed data, not a code dependency.
  await prisma.financeControlPolicy.upsert({
    where: { businessUnitId: businessUnit.id },
    update: {},
    create: {
      legalEntityId: legalEntity.id,
      businessUnitId: businessUnit.id,
      updatedByMembershipId: founderMembership.id,
    },
  });

  // Initial resource settings are local sample data only. Runtime pages read
  // categories, statuses and actions from the database and never branch on
  // these sample codes; future business units configure their own values.
  const resourceCategorySeeds: Array<[string, string, boolean]> = [
    ["EQUIPMENT", "设备资产", false], ["SOFTWARE", "软件资产", true], ["CLOUD", "云资源", false],
    ["DOMAIN", "域名", false], ["SIM_CARD", "手机卡", false], ["ACCESS_CARD", "门禁卡", false],
    ["KEY", "钥匙", false], ["VEHICLE", "车辆", false], ["OFFICE_SUPPLY", "办公用品", false],
    ["CONSUMABLE", "消耗品", false], ["WORKPLACE", "办公场所", false], ["OTHER", "其他", false],
  ];
  for (const [sortOrder, [code, name, isSoftware]] of resourceCategorySeeds.entries()) {
    await prisma.resourceCategory.upsert({
      where: { businessUnitId_code: { businessUnitId: businessUnit.id, code } },
      update: {},
      create: { legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, code, name, isSoftware, sortOrder },
    });
  }
  const resourceStatusSeeds: Array<[string, string, string, boolean]> = [
    ["IN_STOCK", "库存中", "slate", false], ["IN_USE", "使用中", "emerald", false],
    ["LOANED", "借用中", "amber", false], ["MAINTENANCE", "维修中", "orange", false],
    ["RETIRED", "报废", "zinc", true], ["LOST", "遗失", "rose", true],
    ["ARCHIVED", "已归档", "zinc", true],
  ];
  for (const [sortOrder, [code, name, color, isTerminal]] of resourceStatusSeeds.entries()) {
    await prisma.resourceStatus.upsert({
      where: { businessUnitId_code: { businessUnitId: businessUnit.id, code } },
      update: {},
      create: { legalEntityId: legalEntity.id, businessUnitId: businessUnit.id, code, name, color, isTerminal, sortOrder },
    });
  }
  const seededResourceStatuses = new Map((await prisma.resourceStatus.findMany({
    where: { businessUnitId: businessUnit.id },
    select: { id: true, code: true },
  })).map((status) => [status.code, status.id]));
  if (
    seededResourceStatuses.has("IN_STOCK")
    && seededResourceStatuses.has("IN_USE")
    && seededResourceStatuses.has("LOANED")
    && seededResourceStatuses.has("MAINTENANCE")
    && seededResourceStatuses.has("ARCHIVED")
    && seededResourceStatuses.has("RETIRED")
    && seededResourceStatuses.has("LOST")
  ) {
    const resourceLifecycleSeeds = [
      { code: "ASSIGN", name: "分配使用", from: "IN_STOCK", to: "IN_USE", delta: -1, requiresAssignee: true, archive: false },
      { code: "BORROW", name: "借用", from: "IN_STOCK", to: "LOANED", delta: -1, requiresAssignee: true, archive: false },
      { code: "RETURN", name: "归还", from: "LOANED", to: "IN_STOCK", delta: 1, requiresAssignee: false, archive: false },
      { code: "RELEASE", name: "解除领用", from: "IN_USE", to: "IN_STOCK", delta: 1, requiresAssignee: false, archive: false },
      { code: "TRANSFER", name: "转移领用人", from: "IN_USE", to: "IN_USE", delta: 0, requiresAssignee: true, archive: false },
      { code: "REPAIR_FROM_STOCK", name: "库存送修", from: "IN_STOCK", to: "MAINTENANCE", delta: -1, requiresAssignee: false, archive: false },
      { code: "REPAIR_FROM_USE", name: "使用中送修", from: "IN_USE", to: "MAINTENANCE", delta: 0, requiresAssignee: false, archive: false },
      { code: "COMPLETE_REPAIR", name: "维修完成入库", from: "MAINTENANCE", to: "IN_STOCK", delta: 1, requiresAssignee: false, archive: false },
      { code: "RETIRE", name: "报废", from: null, to: "RETIRED", delta: 0, requiresAssignee: false, archive: true },
      { code: "MARK_LOST", name: "标记遗失", from: null, to: "LOST", delta: 0, requiresAssignee: false, archive: true },
      { code: "ARCHIVE", name: "归档", from: null, to: "ARCHIVED", delta: 0, requiresAssignee: false, archive: true },
    ];
    for (const [sortOrder, action] of resourceLifecycleSeeds.entries()) {
      await prisma.resourceLifecycleAction.upsert({
        where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: action.code } },
        update: {},
        create: {
          legalEntityId: legalEntity.id,
          businessUnitId: businessUnit.id,
          code: action.code,
          name: action.name,
          fromStatusId: action.from ? seededResourceStatuses.get(action.from) ?? null : null,
          toStatusId: action.to ? seededResourceStatuses.get(action.to) ?? null : null,
          availableQuantityDelta: action.delta,
          requiresAssignee: action.requiresAssignee,
          archiveAsset: action.archive,
          sortOrder,
        },
      });
    }
  }
  const demoEquipmentCategory = await prisma.resourceCategory.findFirst({ where: { businessUnitId: businessUnit.id, code: "EQUIPMENT" }, select: { id: true } });
  const demoSoftwareCategory = await prisma.resourceCategory.findFirst({ where: { businessUnitId: businessUnit.id, code: "SOFTWARE" }, select: { id: true } });
  const demoInStock = await prisma.resourceStatus.findFirst({ where: { businessUnitId: businessUnit.id, code: "IN_STOCK" }, select: { id: true } });
  if (demoEquipmentCategory && demoInStock) {
    const exists = await prisma.resourceAsset.findFirst({ where: { businessUnitId: businessUnit.id, resourceNo: "DEMO-RESOURCE-001" }, select: { id: true } });
    if (!exists) await prisma.resourceAsset.create({
      data: {
        legalEntityId: legalEntity.id,
        businessUnitId: businessUnit.id,
        departmentId: rootDepartment.id,
        siteId: site.id,
        categoryId: demoEquipmentCategory.id,
        statusId: demoInStock.id,
        resourceNo: "DEMO-RESOURCE-001",
        name: "演示办公笔记本",
        brandModel: "Demo 14",
        serialNumber: "DEMO-LOCAL-001",
        ownership: "公司自有",
        location: "默认站点",
        quantity: 1,
        availableQuantity: 1,
        currency: "CNY",
        valueCents: BigInt("599900"),
        createdByMembershipId: founderMembership.id,
        note: "仅用于本地资源中心验收，不是真实资产。",
      },
    });
  }
  if (demoSoftwareCategory && demoInStock) {
    const exists = await prisma.resourceAsset.findFirst({ where: { businessUnitId: businessUnit.id, resourceNo: "DEMO-SOFTWARE-001" }, select: { id: true } });
    if (!exists) await prisma.resourceAsset.create({
      data: {
        legalEntityId: legalEntity.id,
        businessUnitId: businessUnit.id,
        departmentId: rootDepartment.id,
        siteId: site.id,
        categoryId: demoSoftwareCategory.id,
        statusId: demoInStock.id,
        resourceNo: "DEMO-SOFTWARE-001",
        name: "演示协作软件",
        ownership: "订阅",
        quantity: 1,
        availableQuantity: 1,
        currency: "CNY",
        valueCents: BigInt("199900"),
        expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        createdByMembershipId: founderMembership.id,
        note: "仅用于本地软件资产验收，不含真实账号或凭据。",
        softwareProfile: {
          create: {
            platform: "Demo Platform",
            accountIdentifier: "demo-admin@local.erp",
            licenseType: "团队版",
            seatsTotal: 10,
            seatsUsed: 3,
            autoRenewal: false,
            renewalCostCents: BigInt("199900"),
            renewalCurrency: "CNY",
            renewalCycle: "年付",
          },
        },
      },
    });
  }
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
        requireSku: false,
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
        requireSku: false,
        customFields: [
          { key: "salesChannel", label: "销售渠道", type: "text", required: false },
          { key: "customerRemark", label: "客户要求", type: "text", required: false },
        ],
      },
      isDefault: true,
    },
  });

  // Initial demo data only. Runtime numbering always resolves active rules
  // from the database; future companies, departments, and templates are
  // configured through the ERP and never depend on this seed value.
  const orderNumberRuleCount = await prisma.orderNumberRule.count({
    where: { businessUnitId: businessUnit.id },
  });
  if (orderNumberRuleCount === 0) {
    await prisma.orderNumberRule.create({
      data: {
        legalEntityId: legalEntity.id,
        businessUnitId: businessUnit.id,
        code: "DEFAULT_DAILY",
        name: "默认每日订单编号",
        prefix: "ZY",
        dateFormat: "YYYYMDD",
        timeZone: "Asia/Shanghai",
        includeDepartmentCode: false,
        separator: "-",
        sequencePadding: 1,
        resetPeriod: "DAILY",
        priority: 0,
        isDefault: true,
        isActive: true,
      },
    });
  }

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
