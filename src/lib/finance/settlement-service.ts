import {
  FinanceLineReconciliationStatus,
  FinancePaymentStatus,
  FinanceReconciliationStatus,
  FinanceStatementStatus,
  Prisma,
} from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { createFinanceAccessPlan, type FinanceAccessMembership, type FinanceAccessTarget } from "@/lib/finance/access";
import { parseCurrencyScale, parseMinorAmount } from "@/lib/finance/money";
import { checkFinanceSegregation, resolveFinanceSegregationPolicy } from "@/lib/finance/segregation-policy";
import {
  actionForPaymentCommand,
  actionForStatementCommand,
  nextPaymentState,
  nextStatementState,
  type FinancePaymentCommand,
  type FinanceStatementCommand,
} from "@/lib/finance/state";
import { prisma } from "@/lib/prisma";

export type FinanceActor = {
  userId: string;
  membership: FinanceAccessMembership & { legalEntityId: string };
};

export class FinanceServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "FinanceServiceError";
  }
}

type ScopeInput = {
  departmentId?: string | null;
  siteId?: string | null;
};

function targetFor(scope: ScopeInput, actor: FinanceActor): FinanceAccessTarget {
  return {
    businessUnitId: actor.membership.businessUnitId,
    departmentId: scope.departmentId ?? null,
    siteId: scope.siteId ?? null,
    ownerMembershipId: actor.membership.id,
  };
}

function targetForStatement(row: {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  createdByMembershipId: string;
}): FinanceAccessTarget {
  return {
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    siteId: row.siteId,
    ownerMembershipId: row.createdByMembershipId,
  };
}

function targetForPayment(row: {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  createdByMembershipId: string;
}): FinanceAccessTarget {
  return targetForStatement(row);
}

function targetForCounterparty(row: {
  businessUnitId: string;
  departmentId: string | null;
  createdByMembershipId: string;
}): FinanceAccessTarget {
  return {
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    siteId: null,
    ownerMembershipId: row.createdByMembershipId,
  };
}

async function requireScopedAction(actor: FinanceActor, actionKey: string, target: FinanceAccessTarget) {
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey });
  if (!plan.allows(target)) {
    throw new FinanceServiceError("FORBIDDEN", "当前岗位在所选业务范围内没有该财务操作权限。", 403);
  }
  return plan;
}

async function requireCreateScopedAction(actor: FinanceActor, actionKey: string, target: FinanceAccessTarget) {
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey });
  if (!plan.allowsCreate(target)) {
    throw new FinanceServiceError("CREATE_SCOPE_FORBIDDEN", "当前岗位不能在所选部门或站点创建该财务记录。", 403);
  }
  return plan;
}

function scopeIdentifier(value: unknown, field: string, fallback: string | null) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new FinanceServiceError("INVALID_SCOPE", `${field} 格式不正确。`, 400);
  const normalized = value.trim();
  return normalized || null;
}

async function validateScopeInput(actor: FinanceActor, scope: ScopeInput) {
  if (scope.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: scope.departmentId, businessUnitId: actor.membership.businessUnitId, isActive: true },
      select: { id: true },
    });
    if (!department) throw new FinanceServiceError("DEPARTMENT_OUT_OF_SCOPE", "部门不属于当前业务板块或已停用。", 400);
  }
  if (scope.siteId) {
    const site = await prisma.site.findFirst({
      where: { id: scope.siteId, businessUnitId: actor.membership.businessUnitId, isActive: true },
      select: { id: true, departmentId: true },
    });
    if (!site) throw new FinanceServiceError("SITE_OUT_OF_SCOPE", "站点不属于当前业务板块或已停用。", 400);
    if (scope.departmentId && site.departmentId && site.departmentId !== scope.departmentId) {
      throw new FinanceServiceError("SITE_DEPARTMENT_MISMATCH", "站点与所选部门不一致。", 400);
    }
  }
}

function requiredText(value: unknown, field: string, max = 120) {
  if (typeof value !== "string") throw new FinanceServiceError("INVALID_INPUT", `${field} 为必填项。`, 400);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new FinanceServiceError("INVALID_INPUT", `${field} 长度不正确。`, 400);
  return normalized;
}

function optionalText(value: unknown, max = 2000) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new FinanceServiceError("INVALID_INPUT", "文本字段格式不正确。", 400);
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function dateOrNull(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new FinanceServiceError("INVALID_DATE", `${field} 格式不正确。`, 400);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new FinanceServiceError("INVALID_DATE", `${field} 格式不正确。`, 400);
  return date;
}

function ensurePeriod(periodStart: Date | null, periodEnd: Date | null) {
  if (periodStart && periodEnd && periodStart.getTime() > periodEnd.getTime()) {
    throw new FinanceServiceError("INVALID_PERIOD", "结算期间的开始日期不能晚于结束日期。", 400);
  }
}

const statementCommands = [
  "start_reconciliation",
  "mark_exception",
  "resume_reconciliation",
  "approve",
  "post",
  "void",
] as const;

const paymentCommands = ["approve", "post", "void"] as const;

function parseStatementCommand(value: unknown): FinanceStatementCommand {
  if (typeof value !== "string" || !statementCommands.includes(value as FinanceStatementCommand)) {
    throw new FinanceServiceError("INVALID_STATEMENT_COMMAND", "不支持的结算单状态操作。", 400);
  }
  return value as FinanceStatementCommand;
}

function parsePaymentCommand(value: unknown): FinancePaymentCommand {
  if (typeof value !== "string" || !paymentCommands.includes(value as FinancePaymentCommand)) {
    throw new FinanceServiceError("INVALID_PAYMENT_COMMAND", "不支持的付款状态操作。", 400);
  }
  return value as FinancePaymentCommand;
}

async function ensureCounterpartyReadable(actor: FinanceActor, counterpartyId: string) {
  const counterparty = await prisma.financeCounterparty.findFirst({
    where: {
      id: counterpartyId,
      legalEntityId: actor.membership.legalEntityId,
      businessUnitId: actor.membership.businessUnitId,
      isActive: true,
    },
  });
  if (!counterparty) throw new FinanceServiceError("COUNTERPARTY_NOT_FOUND", "结算对象不存在、已停用或不属于当前业务板块。", 404);
  await requireScopedAction(actor, "finance.counterparty.read", targetForCounterparty(counterparty));
  return counterparty;
}

export async function createCounterparty(actor: FinanceActor, input: {
  code?: unknown;
  name?: unknown;
  type?: unknown;
  departmentId?: unknown;
}) {
  const code = requiredText(input.code, "结算对象编码", 60).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) {
    throw new FinanceServiceError("INVALID_COUNTERPARTY_CODE", "结算对象编码仅支持大写字母、数字、下划线和短横线。", 400);
  }
  const name = requiredText(input.name, "结算对象名称", 160);
  const type = requiredText(input.type, "结算对象类型", 40);
  if (!["LOGISTICS_PROVIDER", "WAREHOUSE_PROVIDER", "SERVICE_PROVIDER", "OTHER"].includes(type)) {
    throw new FinanceServiceError("INVALID_COUNTERPARTY_TYPE", "结算对象类型不受支持。", 400);
  }
  const scope = { departmentId: scopeIdentifier(input.departmentId, "departmentId", actor.membership.departmentId), siteId: null };
  await validateScopeInput(actor, scope);
  await requireCreateScopedAction(actor, "finance.counterparty.manage", targetFor(scope, actor));

  return prisma.$transaction(async (tx) => {
    const row = await tx.financeCounterparty.create({
      data: {
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        departmentId: scope.departmentId,
        code,
        name,
        type: type as "LOGISTICS_PROVIDER" | "WAREHOUSE_PROVIDER" | "SERVICE_PROVIDER" | "OTHER",
        createdByMembershipId: actor.membership.id,
      },
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: row.legalEntityId,
      businessUnitId: row.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.counterparty",
      action: "finance.counterparty.manage",
      targetType: "finance_counterparty",
      targetId: row.id,
      details: { code: row.code, type: row.type, departmentId: row.departmentId },
    }, tx);
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createStatementDraft(actor: FinanceActor, input: {
  counterpartyId?: unknown;
  statementNo?: unknown;
  type?: unknown;
  currency?: unknown;
  currencyScale?: unknown;
  totalAmountCents?: unknown;
  departmentId?: unknown;
  siteId?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  issuedAt?: unknown;
  externalReference?: unknown;
  note?: unknown;
}) {
  const counterpartyId = requiredText(input.counterpartyId, "结算对象", 80);
  const statementNo = requiredText(input.statementNo, "结算单号", 100);
  const type = requiredText(input.type, "结算类型", 40);
  if (!["COD_REMITTANCE", "SHIPPING_FEE", "WAREHOUSE_FEE", "RETURN_FEE", "OTHER"].includes(type)) {
    throw new FinanceServiceError("INVALID_STATEMENT_TYPE", "结算类型不受支持。", 400);
  }
  const currency = requiredText(input.currency, "币种", 12).toUpperCase();
  if (!/^[A-Z]{3,12}$/.test(currency)) throw new FinanceServiceError("INVALID_CURRENCY", "币种必须为字母代码。", 400);
  const currencyScale = parseCurrencyScale(input.currencyScale);
  const totalAmountCents = parseMinorAmount(input.totalAmountCents, "totalAmountCents");
  const scope = {
    departmentId: scopeIdentifier(input.departmentId, "departmentId", actor.membership.departmentId),
    siteId: scopeIdentifier(input.siteId, "siteId", actor.membership.siteId),
  };
  await validateScopeInput(actor, scope);
  await requireCreateScopedAction(actor, "finance.statement.create", targetFor(scope, actor));
  const counterparty = await ensureCounterpartyReadable(actor, counterpartyId);
  if (counterparty.departmentId && counterparty.departmentId !== scope.departmentId) {
    throw new FinanceServiceError("COUNTERPARTY_SCOPE_MISMATCH", "结算对象只允许用于其所属部门的结算单。", 400);
  }
  const periodStart = dateOrNull(input.periodStart, "期间开始");
  const periodEnd = dateOrNull(input.periodEnd, "期间结束");
  ensurePeriod(periodStart, periodEnd);

  return prisma.$transaction(async (tx) => {
    const row = await tx.financeStatement.create({
      data: {
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        departmentId: scope.departmentId,
        siteId: scope.siteId,
        counterpartyId,
        statementNo,
        type: type as "COD_REMITTANCE" | "SHIPPING_FEE" | "WAREHOUSE_FEE" | "RETURN_FEE" | "OTHER",
        currency,
        currencyScale,
        totalAmountCents,
        periodStart,
        periodEnd,
        issuedAt: dateOrNull(input.issuedAt, "出账日期"),
        externalReference: optionalText(input.externalReference, 160),
        note: optionalText(input.note),
        createdByMembershipId: actor.membership.id,
      },
      include: { counterparty: { select: { id: true, code: true, name: true, type: true } }, _count: { select: { lines: true, paymentAllocations: true } } },
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: row.legalEntityId,
      businessUnitId: row.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.statement",
      action: "finance.statement.create",
      targetType: "finance_statement",
      targetId: row.id,
      details: { statementNo: row.statementNo, counterpartyId: row.counterpartyId, type: row.type, currency: row.currency, currencyScale: row.currencyScale, totalAmountCents: row.totalAmountCents.toString() },
    }, tx);
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function findScopedStatement(actor: FinanceActor, id: string, actionKey: string) {
  const row = await prisma.financeStatement.findFirst({
    where: {
      id,
      legalEntityId: actor.membership.legalEntityId,
      businessUnitId: actor.membership.businessUnitId,
    },
    include: { counterparty: true },
  });
  if (!row) throw new FinanceServiceError("STATEMENT_NOT_FOUND", "结算单不存在或不属于当前业务板块。", 404);
  await requireScopedAction(actor, actionKey, targetForStatement(row));
  return row;
}

async function resolveReferenceForLine(actor: FinanceActor, input: { orderNo?: unknown; trackingNo?: unknown }, scope: ScopeInput) {
  const orderNo = typeof input.orderNo === "string" ? input.orderNo.trim() : "";
  const trackingNo = typeof input.trackingNo === "string" ? input.trackingNo.trim() : "";
  if (orderNo && trackingNo) throw new FinanceServiceError("REFERENCE_AMBIGUOUS", "一条结算明细只能关联订单号或运单号之一。", 400);
  if (!orderNo && !trackingNo) return { orderId: null, shipmentId: null, sourceReference: null, snapshot: null };

  if (orderNo) {
    const order = await prisma.order.findFirst({
      where: {
        orderNo,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
      },
      select: { id: true, orderNo: true, departmentId: true, siteId: true, ownedByMembershipId: true },
    });
    if (!order) throw new FinanceServiceError("ORDER_REFERENCE_NOT_FOUND", "订单号在当前业务板块不存在。", 404);
    await requireScopedAction(actor, "finance.reconciliation.match", {
      businessUnitId: actor.membership.businessUnitId,
      departmentId: order.departmentId,
      siteId: order.siteId,
      ownerMembershipId: order.ownedByMembershipId,
    });
    if (scope.departmentId && scope.departmentId !== order.departmentId) throw new FinanceServiceError("REFERENCE_SCOPE_MISMATCH", "订单不属于该结算单的部门范围。", 400);
    if (scope.siteId && scope.siteId !== order.siteId) throw new FinanceServiceError("REFERENCE_SCOPE_MISMATCH", "订单不属于该结算单的站点范围。", 400);
    return { orderId: order.id, shipmentId: null, sourceReference: order.orderNo, snapshot: { orderId: order.id, orderNo: order.orderNo, departmentId: order.departmentId, siteId: order.siteId, ownerMembershipId: order.ownedByMembershipId } };
  }

  const shipment = await prisma.shipment.findFirst({
    where: {
      trackingNo,
      legalEntityId: actor.membership.legalEntityId,
      businessUnitId: actor.membership.businessUnitId,
    },
    select: { id: true, trackingNo: true, siteId: true, order: { select: { id: true, orderNo: true, departmentId: true, ownedByMembershipId: true } } },
  });
  if (!shipment) throw new FinanceServiceError("SHIPMENT_REFERENCE_NOT_FOUND", "运单号在当前业务板块不存在。", 404);
  await requireScopedAction(actor, "finance.reconciliation.match", {
    businessUnitId: actor.membership.businessUnitId,
    departmentId: shipment.order.departmentId,
    siteId: shipment.siteId,
    ownerMembershipId: shipment.order.ownedByMembershipId,
  });
  if (scope.departmentId && scope.departmentId !== shipment.order.departmentId) throw new FinanceServiceError("REFERENCE_SCOPE_MISMATCH", "运单不属于该结算单的部门范围。", 400);
  if (scope.siteId && scope.siteId !== shipment.siteId) throw new FinanceServiceError("REFERENCE_SCOPE_MISMATCH", "运单不属于该结算单的站点范围。", 400);
  return { orderId: null, shipmentId: shipment.id, sourceReference: shipment.trackingNo, snapshot: { shipmentId: shipment.id, trackingNo: shipment.trackingNo, orderId: shipment.order.id, orderNo: shipment.order.orderNo, departmentId: shipment.order.departmentId, siteId: shipment.siteId, ownerMembershipId: shipment.order.ownedByMembershipId } };
}

export async function addStatementLine(actor: FinanceActor, statementId: string, input: {
  amountCents?: unknown;
  description?: unknown;
  orderNo?: unknown;
  trackingNo?: unknown;
}) {
  const statement = await findScopedStatement(actor, statementId, "finance.statement.update");
  if (statement.status !== FinanceStatementStatus.DRAFT) {
    throw new FinanceServiceError("STATEMENT_NOT_EDITABLE", "只有草稿结算单可以新增明细。", 409);
  }
  const amountCents = parseMinorAmount(input.amountCents, "amountCents");
  const reference = await resolveReferenceForLine(actor, input, statement);

  return prisma.$transaction(async (tx) => {
    const current = await tx.financeStatement.findFirst({
      where: { id: statement.id, businessUnitId: actor.membership.businessUnitId, status: FinanceStatementStatus.DRAFT },
      select: { id: true },
    });
    if (!current) throw new FinanceServiceError("STATEMENT_STALE", "结算单状态已变化，请刷新后重试。", 409);
    const latest = await tx.financeStatementLine.findFirst({
      where: { statementId: statement.id },
      orderBy: { lineNo: "desc" },
      select: { lineNo: true },
    });
    const row = await tx.financeStatementLine.create({
      data: {
        statementId: statement.id,
        lineNo: (latest?.lineNo ?? 0) + 1,
        orderId: reference.orderId,
        shipmentId: reference.shipmentId,
        sourceReference: reference.sourceReference,
        description: optionalText(input.description, 500),
        currency: statement.currency,
        currencyScale: statement.currencyScale,
        amountCents,
        sourceSnapshot: reference.snapshot ? reference.snapshot as Prisma.InputJsonValue : undefined,
      },
      include: { reconciliations: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] } },
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: statement.legalEntityId,
      businessUnitId: statement.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.statement",
      action: "finance.statement.update",
      targetType: "finance_statement_line",
      targetId: row.id,
      details: { statementId: statement.id, lineNo: row.lineNo, amountCents: row.amountCents.toString(), orderId: row.orderId, shipmentId: row.shipmentId },
    }, tx);
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionStatement(actor: FinanceActor, statementId: string, input: { command?: unknown; reason?: unknown }) {
  const command = parseStatementCommand(input.command);
  const actionKey = actionForStatementCommand(command);
  const statement = await findScopedStatement(actor, statementId, actionKey);
  const nextState = nextStatementState(statement.status, command) as FinanceStatementStatus;
  const reason = optionalText(input.reason, 1000);
  if (command === "void" && !reason) {
    throw new FinanceServiceError("VOID_REASON_REQUIRED", "作废结算单必须填写原因。", 400);
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.financeStatement.findFirst({
      where: { id: statement.id, businessUnitId: actor.membership.businessUnitId },
      include: {
        lines: {
          select: {
            id: true,
            amountCents: true,
            reconciliationStatus: true,
            reconciliations: {
              where: { status: FinanceReconciliationStatus.CONFIRMED },
              select: { id: true },
            },
          },
        },
        createdByMembership: { select: { userId: true } },
        approvedByMembership: { select: { userId: true } },
      },
    });
    if (!current || current.status !== statement.status) throw new FinanceServiceError("STATEMENT_STALE", "结算单状态已变化，请刷新后重试。", 409);
    if (input.command === "start_reconciliation") {
      if (!current.lines.length) throw new FinanceServiceError("STATEMENT_LINES_REQUIRED", "结算单至少需要一条明细才可以进入对账。", 409);
      const lineTotal = current.lines.reduce((sum, line) => sum + line.amountCents, BigInt(0));
      if (lineTotal !== current.totalAmountCents) {
        throw new FinanceServiceError("STATEMENT_TOTAL_MISMATCH", "结算单金额必须与全部明细金额合计一致。", 409);
      }
    }
    if (input.command === "approve") {
      const unresolved = current.lines.filter((line) => !["MATCHED", "IGNORED"].includes(line.reconciliationStatus)).length;
      if (unresolved > 0) {
        throw new FinanceServiceError("UNRESOLVED_RECONCILIATIONS", "存在未匹配或金额差异明细，不能批准结算单。", 409);
      }
    }
    if (input.command === "void") {
      const allocationCount = await tx.financePaymentAllocation.count({ where: { statementId: current.id } });
      if (allocationCount > 0) {
        throw new FinanceServiceError("STATEMENT_HAS_PAYMENT_ALLOCATIONS", "结算单已有付款核销，必须先走受控冲销流程，不能直接作废。", 409);
      }
    }
    if (command === "approve" || command === "post") {
      const policy = resolveFinanceSegregationPolicy(await tx.financeControlPolicy.findUnique({
        where: { businessUnitId: current.businessUnitId },
        select: {
          requireStatementApproverDifferentFromCreator: true,
          requireStatementPosterDifferentFromCreator: true,
          requireStatementPosterDifferentFromApprover: true,
          requirePaymentApproverDifferentFromCreator: true,
          requirePaymentPosterDifferentFromCreator: true,
          requirePaymentPosterDifferentFromApprover: true,
        },
      }));
      const segregation = checkFinanceSegregation({
        command: `statement.${command}`,
        actorUserId: actor.userId,
        subject: {
          createdByUserId: current.createdByMembership.userId,
          approvedByUserId: current.approvedByMembership?.userId ?? null,
        },
        policy,
      });
      if (!segregation.allowed) throw new FinanceServiceError(segregation.code, segregation.message, 409);
    }
    const now = new Date();
    const data: Prisma.FinanceStatementUpdateManyMutationInput = {
      status: nextState,
      ...(command === "start_reconciliation" ? { confirmedAt: now } : {}),
      ...(command === "mark_exception" ? { exceptionReason: reason ?? "待人工处理" } : {}),
      ...(command === "resume_reconciliation" ? { exceptionReason: null } : {}),
      ...(command === "approve" ? { approvedAt: now, approvedByMembershipId: actor.membership.id } : {}),
      ...(command === "post" ? { postedAt: now, postedByMembershipId: actor.membership.id } : {}),
      ...(command === "void" ? { voidedAt: now, voidedByMembershipId: actor.membership.id, exceptionReason: reason } : {}),
    };
    const updated = await tx.financeStatement.updateMany({
      where: { id: current.id, status: current.status },
      data,
    });
    if (updated.count !== 1) throw new FinanceServiceError("STATEMENT_STALE", "结算单状态已变化，请刷新后重试。", 409);
    const confirmedReconciliationIds = command === "void"
      ? current.lines.flatMap((line) => line.reconciliations.map((reconciliation) => reconciliation.id))
      : [];
    if (confirmedReconciliationIds.length) {
      await tx.financeReconciliation.updateMany({
        where: { id: { in: confirmedReconciliationIds }, status: FinanceReconciliationStatus.CONFIRMED },
        data: {
          status: FinanceReconciliationStatus.VOIDED,
          voidedAt: now,
          voidedByMembershipId: actor.membership.id,
        },
      });
      for (const reconciliationId of confirmedReconciliationIds) {
        await writeAuditLog({
          actorUserId: actor.userId,
          actorMembershipId: actor.membership.id,
          legalEntityId: current.legalEntityId,
          businessUnitId: current.businessUnitId,
          roleId: actor.membership.roleId,
          module: "finance.reconciliation",
          action: "finance.reconciliation.void",
          targetType: "finance_reconciliation",
          targetId: reconciliationId,
          details: { statementId: current.id, reason, source: "statement_void" },
        }, tx);
      }
    }
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: current.legalEntityId,
      businessUnitId: current.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.statement",
      action: actionKey,
      targetType: "finance_statement",
      targetId: current.id,
      details: { command, from: current.status, to: nextState, reason, totalAmountCents: current.totalAmountCents.toString(), voidedReconciliationCount: confirmedReconciliationIds.length },
    }, tx);
    return tx.financeStatement.findUniqueOrThrow({
      where: { id: current.id },
      include: { counterparty: { select: { id: true, code: true, name: true, type: true } }, lines: { include: { reconciliations: true }, orderBy: { lineNo: "asc" } }, _count: { select: { lines: true, paymentAllocations: true } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function resolveReconciliationTarget(actor: FinanceActor, referenceType: unknown, referenceNo: unknown) {
  const type = requiredText(referenceType, "关联类型", 20);
  const no = requiredText(referenceNo, "订单号或运单号", 160);
  if (type === "ORDER") {
    const order = await prisma.order.findFirst({
      where: {
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        orderNo: no,
      },
      select: { id: true, businessUnitId: true, departmentId: true, siteId: true, ownedByMembershipId: true },
    });
    if (!order) throw new FinanceServiceError("ORDER_REFERENCE_NOT_FOUND", "订单号在当前业务板块不存在。", 404);
    return { orderId: order.id, shipmentId: null, target: { businessUnitId: order.businessUnitId, departmentId: order.departmentId, siteId: order.siteId, ownerMembershipId: order.ownedByMembershipId } };
  }
  if (type === "SHIPMENT") {
    const shipment = await prisma.shipment.findFirst({
      where: {
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        trackingNo: no,
      },
      select: { id: true, businessUnitId: true, siteId: true, order: { select: { departmentId: true, ownedByMembershipId: true } } },
    });
    if (!shipment) throw new FinanceServiceError("SHIPMENT_REFERENCE_NOT_FOUND", "运单号在当前业务板块不存在。", 404);
    return { orderId: null, shipmentId: shipment.id, target: { businessUnitId: shipment.businessUnitId, departmentId: shipment.order.departmentId, siteId: shipment.siteId, ownerMembershipId: shipment.order.ownedByMembershipId } };
  }
  throw new FinanceServiceError("INVALID_REFERENCE_TYPE", "关联类型必须是 ORDER 或 SHIPMENT。", 400);
}

export async function createReconciliation(actor: FinanceActor, statementId: string, lineId: string, input: {
  referenceType?: unknown;
  referenceNo?: unknown;
  amountCents?: unknown;
  reason?: unknown;
}) {
  const statement = await findScopedStatement(actor, statementId, "finance.reconciliation.match");
  if (statement.status !== FinanceStatementStatus.RECONCILING && statement.status !== FinanceStatementStatus.EXCEPTION) {
    throw new FinanceServiceError("STATEMENT_NOT_RECONCILING", "只有对账中或异常待处理的结算单可以新增匹配建议。", 409);
  }
  const amountCents = parseMinorAmount(input.amountCents, "amountCents");
  const reference = await resolveReconciliationTarget(actor, input.referenceType, input.referenceNo);
  await requireScopedAction(actor, "finance.reconciliation.match", targetForStatement(statement));
  await requireScopedAction(actor, "finance.reconciliation.match", reference.target);
  if (statement.departmentId && statement.departmentId !== reference.target.departmentId) throw new FinanceServiceError("REFERENCE_SCOPE_MISMATCH", "关联记录不属于该结算单的部门范围。", 400);
  if (statement.siteId && statement.siteId !== reference.target.siteId) throw new FinanceServiceError("REFERENCE_SCOPE_MISMATCH", "关联记录不属于该结算单的站点范围。", 400);

  return prisma.$transaction(async (tx) => {
    const currentStatement = await tx.financeStatement.findFirst({
      where: {
        id: statement.id,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        status: statement.status,
      },
      select: { id: true },
    });
    if (!currentStatement) {
      throw new FinanceServiceError("STATEMENT_STALE", "结算单状态已变化，请刷新后重试。", 409);
    }
    const line = await tx.financeStatementLine.findFirst({
      where: { id: lineId, statementId: statement.id },
      include: { reconciliations: { where: { status: { in: [FinanceReconciliationStatus.SUGGESTED, FinanceReconciliationStatus.CONFIRMED] } } } },
    });
    if (!line) throw new FinanceServiceError("STATEMENT_LINE_NOT_FOUND", "结算明细不存在。", 404);
    if (
      line.reconciliationStatus === FinanceLineReconciliationStatus.MATCHED ||
      line.reconciliationStatus === FinanceLineReconciliationStatus.IGNORED
    ) {
      throw new FinanceServiceError("STATEMENT_LINE_RESOLVED", "该结算明细已处理完成，不能再次新增匹配建议。", 409);
    }
    const allocated = line.reconciliations.reduce((sum, row) => sum + row.amountCents, BigInt(0));
    if (allocated + amountCents > line.amountCents) {
      throw new FinanceServiceError("RECONCILIATION_OVER_ALLOCATED", "匹配金额超过了该结算明细的金额。", 409);
    }
    const referenceKey = reference.orderId ? { orderId: reference.orderId } : { shipmentId: reference.shipmentId! };
    const alreadyConfirmed = await tx.financeReconciliation.findFirst({
      where: {
        legalEntityId: statement.legalEntityId,
        businessUnitId: statement.businessUnitId,
        counterpartyId: statement.counterpartyId,
        statementType: statement.type,
        status: FinanceReconciliationStatus.CONFIRMED,
        ...referenceKey,
      },
      select: { id: true },
    });
    if (alreadyConfirmed) {
      throw new FinanceServiceError("REFERENCE_ALREADY_RECONCILED", "该订单或运单已在同一结算对象和结算类型下确认，不能重复结算。", 409);
    }
    const row = await tx.financeReconciliation.create({
      data: {
        legalEntityId: statement.legalEntityId,
        businessUnitId: statement.businessUnitId,
        counterpartyId: statement.counterpartyId,
        statementType: statement.type,
        statementLineId: line.id,
        orderId: reference.orderId,
        shipmentId: reference.shipmentId,
        amountCents,
        status: FinanceReconciliationStatus.SUGGESTED,
        method: "MANUAL",
        reason: optionalText(input.reason, 1000),
        createdByMembershipId: actor.membership.id,
      },
    });
    await tx.financeStatementLine.update({ where: { id: line.id }, data: { reconciliationStatus: FinanceLineReconciliationStatus.SUGGESTED } });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: statement.legalEntityId,
      businessUnitId: statement.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.reconciliation",
      action: "finance.reconciliation.match",
      targetType: "finance_reconciliation",
      targetId: row.id,
      details: { statementId: statement.id, statementLineId: line.id, orderId: row.orderId, shipmentId: row.shipmentId, amountCents: row.amountCents.toString(), status: row.status },
    }, tx);
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveReconciliation(actor: FinanceActor, statementId: string, lineId: string, reconciliationId: string, input: { command?: unknown; reason?: unknown }) {
  const statement = await findScopedStatement(actor, statementId, "finance.reconciliation.resolve");
  if (statement.status !== FinanceStatementStatus.RECONCILING && statement.status !== FinanceStatementStatus.EXCEPTION) {
    throw new FinanceServiceError("STATEMENT_NOT_RECONCILING", "只有对账中或异常待处理的结算单可以处理匹配建议。", 409);
  }
  const command = requiredText(input.command, "对账处理", 20).toLowerCase();
  if (!["confirm", "reject", "ignore"].includes(command)) throw new FinanceServiceError("INVALID_RECONCILIATION_COMMAND", "对账处理必须是 confirm、reject 或 ignore。", 400);
  if (command !== "confirm" && !optionalText(input.reason, 1000)) {
    throw new FinanceServiceError("RECONCILIATION_REASON_REQUIRED", "拒绝或忽略匹配必须填写原因。", 400);
  }
  const reason = optionalText(input.reason, 1000);

  return prisma.$transaction(async (tx) => {
    const currentStatement = await tx.financeStatement.findFirst({
      where: {
        id: statement.id,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        status: statement.status,
      },
      select: { id: true },
    });
    if (!currentStatement) {
      throw new FinanceServiceError("STATEMENT_STALE", "结算单状态已变化，请刷新后重试。", 409);
    }
    const reconciliation = await tx.financeReconciliation.findFirst({
      where: {
        id: reconciliationId,
        statementLineId: lineId,
        legalEntityId: statement.legalEntityId,
        businessUnitId: statement.businessUnitId,
        counterpartyId: statement.counterpartyId,
        statementType: statement.type,
        statementLine: { statementId: statement.id },
      },
      include: { statementLine: { include: { reconciliations: true } } },
    });
    if (!reconciliation) throw new FinanceServiceError("RECONCILIATION_NOT_FOUND", "对账匹配不存在。", 404);
    if (reconciliation.status !== FinanceReconciliationStatus.SUGGESTED) {
      throw new FinanceServiceError("RECONCILIATION_ALREADY_RESOLVED", "该对账匹配已经处理。", 409);
    }
    const nextStatus = command === "confirm"
      ? FinanceReconciliationStatus.CONFIRMED
      : command === "ignore"
        ? FinanceReconciliationStatus.IGNORED
        : FinanceReconciliationStatus.REJECTED;
    if (command === "confirm") {
      const referenceKey = reconciliation.orderId
        ? { orderId: reconciliation.orderId }
        : { shipmentId: reconciliation.shipmentId! };
      const alreadyConfirmed = await tx.financeReconciliation.findFirst({
        where: {
          id: { not: reconciliation.id },
          legalEntityId: statement.legalEntityId,
          businessUnitId: statement.businessUnitId,
          counterpartyId: statement.counterpartyId,
          statementType: statement.type,
          status: FinanceReconciliationStatus.CONFIRMED,
          ...referenceKey,
        },
        select: { id: true },
      });
      if (alreadyConfirmed) {
        throw new FinanceServiceError("REFERENCE_ALREADY_RECONCILED", "该订单或运单已在同一结算对象和结算类型下确认，不能重复结算。", 409);
      }
    }
    await tx.financeReconciliation.update({
      where: { id: reconciliation.id },
      data: {
        status: nextStatus,
        reason: reason ?? reconciliation.reason,
        confirmedByMembershipId: actor.membership.id,
        confirmedAt: new Date(),
      },
    });
    const all = await tx.financeReconciliation.findMany({ where: { statementLineId: reconciliation.statementLineId } });
    const active = all.filter(
      (row) => row.status === FinanceReconciliationStatus.SUGGESTED || row.status === FinanceReconciliationStatus.CONFIRMED,
    );
    const confirmedTotal = all
      .filter((row) => row.status === FinanceReconciliationStatus.CONFIRMED)
      .reduce((sum, row) => sum + row.amountCents, BigInt(0));
    const hasSuggestion = active.some((row) => row.status === FinanceReconciliationStatus.SUGGESTED);
    const lineStatus = command === "ignore" && active.length === 0
      ? FinanceLineReconciliationStatus.IGNORED
      : confirmedTotal === reconciliation.statementLine.amountCents && !hasSuggestion
        ? FinanceLineReconciliationStatus.MATCHED
        : hasSuggestion
          ? FinanceLineReconciliationStatus.SUGGESTED
          : FinanceLineReconciliationStatus.UNMATCHED;
    await tx.financeStatementLine.update({ where: { id: reconciliation.statementLineId }, data: { reconciliationStatus: lineStatus } });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: statement.legalEntityId,
      businessUnitId: statement.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.reconciliation",
      action: "finance.reconciliation.resolve",
      targetType: "finance_reconciliation",
      targetId: reconciliation.id,
      details: { statementId: statement.id, statementLineId: reconciliation.statementLineId, command, from: reconciliation.status, to: nextStatus, lineStatus, reason },
    }, tx);
    return tx.financeReconciliation.findUniqueOrThrow({ where: { id: reconciliation.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createPaymentDraft(actor: FinanceActor, input: {
  counterpartyId?: unknown;
  paymentNo?: unknown;
  direction?: unknown;
  currency?: unknown;
  currencyScale?: unknown;
  amountCents?: unknown;
  departmentId?: unknown;
  siteId?: unknown;
  paidAt?: unknown;
  externalReference?: unknown;
  note?: unknown;
}) {
  const counterpartyId = requiredText(input.counterpartyId, "结算对象", 80);
  const paymentNo = requiredText(input.paymentNo, "付款单号", 100);
  const direction = requiredText(input.direction, "收支方向", 20);
  if (!["PAYABLE", "RECEIVABLE"].includes(direction)) throw new FinanceServiceError("INVALID_PAYMENT_DIRECTION", "收支方向必须是 PAYABLE 或 RECEIVABLE。", 400);
  const currency = requiredText(input.currency, "币种", 12).toUpperCase();
  if (!/^[A-Z]{3,12}$/.test(currency)) throw new FinanceServiceError("INVALID_CURRENCY", "币种必须为字母代码。", 400);
  const currencyScale = parseCurrencyScale(input.currencyScale);
  const amountCents = parseMinorAmount(input.amountCents, "amountCents");
  const scope = {
    departmentId: scopeIdentifier(input.departmentId, "departmentId", actor.membership.departmentId),
    siteId: scopeIdentifier(input.siteId, "siteId", actor.membership.siteId),
  };
  await validateScopeInput(actor, scope);
  await requireCreateScopedAction(actor, "finance.payment.create", targetFor(scope, actor));
  const counterparty = await ensureCounterpartyReadable(actor, counterpartyId);
  if (counterparty.departmentId && counterparty.departmentId !== scope.departmentId) {
    throw new FinanceServiceError("COUNTERPARTY_SCOPE_MISMATCH", "结算对象只允许用于其所属部门的付款记录。", 400);
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.financePayment.create({
      data: {
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        departmentId: scope.departmentId,
        siteId: scope.siteId,
        counterpartyId,
        paymentNo,
        direction: direction as "PAYABLE" | "RECEIVABLE",
        currency,
        currencyScale,
        amountCents,
        paidAt: dateOrNull(input.paidAt, "付款日期"),
        externalReference: optionalText(input.externalReference, 160),
        note: optionalText(input.note),
        createdByMembershipId: actor.membership.id,
      },
      include: { counterparty: { select: { id: true, code: true, name: true, type: true } }, allocations: { include: { statement: { select: { id: true, statementNo: true, currency: true, currencyScale: true } } } } },
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: row.legalEntityId,
      businessUnitId: row.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.payment",
      action: "finance.payment.create",
      targetType: "finance_payment",
      targetId: row.id,
      details: { paymentNo: row.paymentNo, counterpartyId: row.counterpartyId, direction: row.direction, currency: row.currency, currencyScale: row.currencyScale, amountCents: row.amountCents.toString() },
    }, tx);
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function findScopedPayment(actor: FinanceActor, id: string, actionKey: string) {
  const row = await prisma.financePayment.findFirst({
    where: {
      id,
      legalEntityId: actor.membership.legalEntityId,
      businessUnitId: actor.membership.businessUnitId,
    },
    include: { counterparty: true },
  });
  if (!row) throw new FinanceServiceError("PAYMENT_NOT_FOUND", "付款记录不存在或不属于当前业务板块。", 404);
  await requireScopedAction(actor, actionKey, targetForPayment(row));
  return row;
}

export async function transitionPayment(actor: FinanceActor, paymentId: string, input: { command?: unknown; reason?: unknown }) {
  const command = parsePaymentCommand(input.command);
  const actionKey = actionForPaymentCommand(command);
  const payment = await findScopedPayment(actor, paymentId, actionKey);
  const nextState = nextPaymentState(payment.status, command) as FinancePaymentStatus;
  const reason = optionalText(input.reason, 1000);
  if (command === "void" && !reason) throw new FinanceServiceError("VOID_REASON_REQUIRED", "作废付款记录必须填写原因。", 400);

  return prisma.$transaction(async (tx) => {
    const current = await tx.financePayment.findFirst({
      where: { id: payment.id, businessUnitId: actor.membership.businessUnitId },
      include: {
        allocations: { include: { statement: true } },
        createdByMembership: { select: { userId: true } },
        approvedByMembership: { select: { userId: true } },
      },
    });
    if (!current || current.status !== payment.status) throw new FinanceServiceError("PAYMENT_STALE", "付款记录状态已变化，请刷新后重试。", 409);
    if (input.command === "post") {
      if (!current.allocations.length) throw new FinanceServiceError("PAYMENT_ALLOCATIONS_REQUIRED", "付款过账前必须至少核销一张已批准结算单。", 409);
      const allocated = current.allocations.reduce((sum, allocation) => sum + allocation.amountCents, BigInt(0));
      if (allocated !== current.amountCents) throw new FinanceServiceError("PAYMENT_ALLOCATION_TOTAL_MISMATCH", "付款核销金额必须与付款金额完全一致。", 409);
      if (current.allocations.some((allocation) => allocation.statement.status !== FinanceStatementStatus.APPROVED)) {
        throw new FinanceServiceError("PAYMENT_STATEMENT_NOT_APPROVED", "只能核销已批准且未过账的结算单。", 409);
      }
    }
    if (input.command === "void" && current.allocations.length) {
      throw new FinanceServiceError("PAYMENT_HAS_ALLOCATIONS", "付款记录已有核销，必须先走受控冲销流程，不能直接作废。", 409);
    }
    if (command === "approve" || command === "post") {
      const policy = resolveFinanceSegregationPolicy(await tx.financeControlPolicy.findUnique({
        where: { businessUnitId: current.businessUnitId },
        select: {
          requireStatementApproverDifferentFromCreator: true,
          requireStatementPosterDifferentFromCreator: true,
          requireStatementPosterDifferentFromApprover: true,
          requirePaymentApproverDifferentFromCreator: true,
          requirePaymentPosterDifferentFromCreator: true,
          requirePaymentPosterDifferentFromApprover: true,
        },
      }));
      const segregation = checkFinanceSegregation({
        command: `payment.${command}`,
        actorUserId: actor.userId,
        subject: {
          createdByUserId: current.createdByMembership.userId,
          approvedByUserId: current.approvedByMembership?.userId ?? null,
        },
        policy,
      });
      if (!segregation.allowed) throw new FinanceServiceError(segregation.code, segregation.message, 409);
    }
    const now = new Date();
    const data: Prisma.FinancePaymentUpdateManyMutationInput = {
      status: nextState,
      ...(command === "approve" ? { approvedAt: now, approvedByMembershipId: actor.membership.id } : {}),
      ...(command === "post" ? { postedAt: now, postedByMembershipId: actor.membership.id } : {}),
      ...(command === "void" ? { voidedAt: now, voidedByMembershipId: actor.membership.id, voidReason: reason } : {}),
    };
    const updated = await tx.financePayment.updateMany({ where: { id: current.id, status: current.status }, data });
    if (updated.count !== 1) throw new FinanceServiceError("PAYMENT_STALE", "付款记录状态已变化，请刷新后重试。", 409);
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: current.legalEntityId,
      businessUnitId: current.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.payment",
      action: actionKey,
      targetType: "finance_payment",
      targetId: current.id,
      details: { command, from: current.status, to: nextState, reason, amountCents: current.amountCents.toString() },
    }, tx);
    return tx.financePayment.findUniqueOrThrow({
      where: { id: current.id },
      include: { counterparty: { select: { id: true, code: true, name: true, type: true } }, allocations: { include: { statement: { select: { id: true, statementNo: true, currency: true, currencyScale: true } } } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function allocatePayment(actor: FinanceActor, paymentId: string, input: { statementId?: unknown; amountCents?: unknown }) {
  const payment = await findScopedPayment(actor, paymentId, "finance.payment.allocate");
  const statementId = requiredText(input.statementId, "结算单", 80);
  const amountCents = parseMinorAmount(input.amountCents, "amountCents");
  const statement = await findScopedStatement(actor, statementId, "finance.payment.allocate");
  await requireScopedAction(actor, "finance.payment.allocate", targetForPayment(payment));
  if (payment.status !== FinancePaymentStatus.APPROVED) throw new FinanceServiceError("PAYMENT_NOT_APPROVED", "只有已批准付款记录可以核销。", 409);
  if (statement.status !== FinanceStatementStatus.APPROVED) throw new FinanceServiceError("STATEMENT_NOT_APPROVED", "只能核销已批准结算单。", 409);
  if (payment.counterpartyId !== statement.counterpartyId) throw new FinanceServiceError("COUNTERPARTY_MISMATCH", "付款记录和结算单必须属于同一结算对象。", 400);
  if (payment.currency !== statement.currency || payment.currencyScale !== statement.currencyScale) {
    throw new FinanceServiceError("CURRENCY_MISMATCH", "付款记录与结算单的币种或最小货币单位不一致。", 400);
  }

  return prisma.$transaction(async (tx) => {
    const currentPayment = await tx.financePayment.findFirst({
      where: { id: payment.id, businessUnitId: actor.membership.businessUnitId, status: FinancePaymentStatus.APPROVED },
      include: { allocations: true },
    });
    const currentStatement = await tx.financeStatement.findFirst({
      where: { id: statement.id, businessUnitId: actor.membership.businessUnitId, status: FinanceStatementStatus.APPROVED },
      include: { paymentAllocations: { include: { payment: { select: { status: true } } } } },
    });
    if (!currentPayment || !currentStatement) throw new FinanceServiceError("ALLOCATION_STALE", "付款或结算单状态已变化，请刷新后重试。", 409);
    const usedByPayment = currentPayment.allocations.reduce((sum, allocation) => sum + allocation.amountCents, BigInt(0));
    const usedByStatement = currentStatement.paymentAllocations
      .filter((allocation) => allocation.payment.status !== FinancePaymentStatus.VOIDED)
      .reduce((sum, allocation) => sum + allocation.amountCents, BigInt(0));
    if (usedByPayment + amountCents > currentPayment.amountCents) throw new FinanceServiceError("PAYMENT_OVER_ALLOCATED", "核销金额超过付款记录可用余额。", 409);
    if (usedByStatement + amountCents > currentStatement.totalAmountCents) throw new FinanceServiceError("STATEMENT_OVER_ALLOCATED", "核销金额超过结算单可用余额。", 409);
    const allocation = await tx.financePaymentAllocation.create({
      data: { paymentId: currentPayment.id, statementId: currentStatement.id, amountCents, createdByMembershipId: actor.membership.id },
      include: { statement: { select: { id: true, statementNo: true, currency: true, currencyScale: true } } },
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: currentPayment.legalEntityId,
      businessUnitId: currentPayment.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.payment",
      action: "finance.payment.allocate",
      targetType: "finance_payment_allocation",
      targetId: allocation.id,
      details: { paymentId: currentPayment.id, statementId: currentStatement.id, amountCents: allocation.amountCents.toString() },
    }, tx);
    return allocation;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
