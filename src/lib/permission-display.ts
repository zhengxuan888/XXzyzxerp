const scopeLabels: Record<string, string> = { ALL: "全部业务板块", BUSINESS_UNIT: "业务板块", DEPARTMENT: "本部门", DEPARTMENT_TREE: "本部门及下级部门", SUBORDINATES: "本人及下属", SITE: "所属站点", SELF: "仅本人" };

const operationLabels: Record<string, string> = { approve: "审批", apply: "执行", archive: "归档", assign: "分派", cancel: "取消", claim: "认领", configure: "配置", confirm: "确认", create: "新增", delete: "删除", dispatch: "派发", download: "下载", export: "导出", import: "导入", lock: "锁定", manage: "管理", match: "匹配", post: "过账", preview: "预览", read: "查看", reject: "驳回", request: "申请", resolve: "处理", review: "审核", ship: "发货", submit: "提交", sync: "同步", update: "编辑", upload: "上传", view: "查看", void: "作废" };

const resourceLabels: Record<string, string> = {
  access_grant: "临时授权", announcement: "公告", approval: "审批单", attachment: "附件", attendance: "考勤", audit_log: "审计日志", business_unit: "业务板块", customer: "客户", daily_goal: "每日目标", delegation: "协作授权", department: "部门", document: "文档", document_category: "文档分类", expense: "费用", finance_allocation_adjustment: "财务核销调整", finance_counterparty: "财务往来单位", finance_control_policy: "财务控制策略", finance_payment: "付款", finance_reconciliation: "财务对账", finance_settlement: "财务结算", finance_statement: "财务账单", finance_statement_artifact: "财务账单文件", finance_statement_import: "财务账单导入", finance_statement_template: "财务账单模板", inbox: "售后收件箱", integration_credential: "第三方接口密钥", inventory: "库存", leave_request: "请假申请", legal_entity: "公司主体", logistics_batch_artifact: "物流批次原文件", logistics_export_batch: "物流导出批次", logistics_return_import: "物流商回传", logistics_template: "物流商模板", marketing_creative: "投放素材", marketing_kpi: "投放指标", marketing_metric: "投放数据指标", marketing_report: "投放日报", marketing_source: "投放渠道", marketing_workbench: "投放工作台", membership: "员工岗位", menu: "菜单", order: "订单", order_numbering: "订单编号规则", order_review: "订单核单", order_review_proof: "核单凭证", order_template: "订单模板", product: "产品", report: "统计报表", resource: "资源资产", role: "角色", shipment: "发货物流", shipment_followup: "物流跟进任务", shipment_timeline: "物流轨迹", shipment_tracking_no: "物流单号", shipment_workbench: "发货与售后工作台", site: "站点", software_asset: "软件资产", team_goal: "团队目标", user: "员工账号",
};

const tokenLabels: Record<string, string> = { access: "访问", action: "动作", adjustment: "调整", allocation: "核销", artifact: "文件", batch: "批次", category: "分类", configuration: "配置", control: "控制", creative: "素材", credential: "密钥", daily: "每日", event: "事件", finance: "财务", followup: "跟进", goal: "目标", grant: "授权", import: "导入", integration: "接口", kpi: "指标", marketing: "投放", membership: "岗位", metric: "数据指标", no: "单号", number: "编号", numbering: "编号规则", order: "订单", payment: "付款", policy: "策略", proof: "凭证", reconciliation: "对账", report: "报表", review: "核单", settlement: "结算", shipment: "物流", software: "软件", source: "渠道", statement: "账单", tag: "标签", team: "团队", template: "模板", timeline: "轨迹", tracking: "追踪", workbench: "工作台" };

export function scopeLabel(scope: string) { return scopeLabels[scope] ?? "自定义范围"; }

export function actionLabel(actionKey: string) {
  const normalized = actionKey.replaceAll(".", "_");
  const parts = normalized.split("_");
  const operation = parts.at(-1) ?? "manage";
  const resourceKey = parts.slice(0, -1).join("_");
  const resource = resourceLabels[resourceKey] ?? parts.slice(0, -1).map((part) => tokenLabels[part] ?? part).join("");
  return `${operationLabels[operation] ?? "操作"}${resource || "系统功能"}`;
}

export function namespaceLabel(namespace: string) { return namespace.toLowerCase() === "erp" ? "ERP 权限" : "系统权限"; }

export function permissionModule(actionKey: string) {
  const resource = actionKey.split(".")[0];
  if (["order", "order_numbering", "order_review", "order_review_proof", "order_template", "product"].includes(resource)) return "订单管理";
  if (["shipment", "shipment_followup", "shipment_timeline", "shipment_tracking_no", "shipment_workbench", "logistics_batch_artifact", "logistics_export_batch", "logistics_return_import", "logistics_template", "inbox", "customer"].includes(resource)) return "发货与售后";
  if (resource === "inventory") return "库存管理";
  if (["marketing_creative", "marketing_kpi", "marketing_metric", "marketing_report", "marketing_source", "marketing_workbench", "daily_goal", "team_goal", "report"].includes(resource)) return "投流与报表";
  if (resource.startsWith("finance_") || resource === "expense") return "财务管理";
  if (["attendance", "leave_request", "announcement", "approval", "document", "document_category"].includes(resource)) return "人事与行政";
  if (["user", "membership", "department", "role", "delegation", "access_grant", "business_unit", "legal_entity", "site"].includes(resource)) return "组织与权限";
  if (["menu", "integration_credential", "audit_log", "resource", "software_asset"].includes(resource)) return "系统配置";
  return "其他权限";
}
