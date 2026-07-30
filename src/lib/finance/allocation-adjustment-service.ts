import {
  FinancePaymentAllocationAdjustmentStatus,
  FinancePaymentAllocationEffectType,
  FinancePaymentStatus,
  FinanceStatementStatus,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { writeAuditLog } from "@/lib/audit";
import { effectiveAllocationAmount } from "@/lib/finance/allocation";
import { createFinanceAccessPlan, type FinanceAccessTarget } from "@/lib/finance/access";
import { formatMinorAmount, serializeMinorAmount } from "@/lib/finance/money";
import { checkFinanceSegregation, resolveFinanceSegregationPolicy } from "@/lib/finance/segregation-policy";
import { FinanceServiceError, type FinanceActor } from "@/lib/finance/settlement-service";
import { prisma } from "@/lib/prisma";

const adjustmentInclude = {
  sourceAllocation: {
    include: {
      effects: { select: { amountCents: true } },
      payment: {
        select: {
          id: true,
          legalEntityId: true,
          businessUnitId: true,
          departmentId: true,
          siteId: true,
          createdByMembershipId: true,
          paymentNo: true,
          status: true,
          counterpartyId: true,
          currency: true,
          currencyScale: true,
          createdByMembership: { select: { userId: true } },
          approvedByMembership: { select: { userId: true } },
        },
      },
      statement: {
        select: {
          id: true,
          legalEntityId: true,
          businessUnitId: true,
          departmentId: true,
          siteId: true,
          createdByMembershipId: true,
          statementNo: true,
          status: true,
          counterpartyId: true,
          currency: true,
          currencyScale: true,
        },
      },
    },
  },
  replacementStatement: {
    select: {
      id: true,
      legalEntityId: true,
      businessUnitId: true,
      departmentId: true,
      siteId: true,
      createdByMembershipId: true,
      statementNo: true,
      status: true,
      counterpartyId: true,
      currency: true,
      currencyScale: true,
    },
  },
  requestedByMembership: { select: { userId: true } },
  approvedByMembership: { select: { userId: true } },
} satisfies Prisma.FinancePaymentAllocationAdjustmentInclude;

type AllocationAdjustmentRow = Prisma.FinancePaymentAllocationAdjustmentGetPayload<{ include: typeof adjustmentInclude }>;

type ScopedFinanceRow = {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  createdByMembershipId: string;
};

function targetFor(row: ScopedFinanceRow): FinanceAccessTarget {
  return {
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    siteId: row.siteId,
    ownerMembershipId: row.createdByMembershipId,
  };
}

function requiredText(value: unknown, label: string, min: number, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) {
    throw new FinanceServiceError("INVALID_ALLOCATION_ADJUSTMENT_INPUT", `${label}必须为 ${min} 到 ${max} 个字符。`, 400);
  }
  return text;
}

function adjustmentIdempotencyKey(value: unknown) {
  return requiredText(value, "调整幂等键", 8, 160);
}

function parseCommand(value: unknown) {
  if (value === "approve" || value === "reject" || value === "cancel" || value === "apply") return value;
  throw new FinanceServiceError("INVALID_ALLOCATION_ADJUSTMENT_COMMAND", "核销调整操作必须为 approve、reject、cancel 或 apply。", 400);
}

function actionForCommand(command: "approve" | "reject" | "cancel" | "apply") {
  if (command === "approve" || command === "reject") return "finance.allocation_adjustment.approve";
  if (command === "cancel") return "finance.allocation_adjustment.cancel";
  return "finance.allocation_adjustment.apply";
}

function normalizedPagination(page: number, pageSize: number) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new FinanceServiceError("INVALID_PAGINATION", "分页参数不正确。", 400);
  }
  return { page, pageSize };
}

function dto(row: AllocationAdjustmentRow) {
  return {
    id: row.id,
    status: row.status,
    amountCents: serializeMinorAmount(row.amountCents),
    amountLabel: formatMinorAmount(row.amountCents, row.sourceAllocation.payment.currency, row.sourceAllocation.payment.currencyScale),
    reason: row.reason,
    requestedByMembershipId: row.requestedByMembershipId,
    requestedAt: row.requestedAt.toISOString(),
    approvedByMembershipId: row.approvedByMembershipId,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvalReason: row.approvalReason,
    rejectedByMembershipId: row.rejectedByMembershipId,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    cancelledByMembershipId: row.cancelledByMembershipId,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    appliedByMembershipId: row.appliedByMembershipId,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    replacementAllocationId: row.replacementAllocationId,
    source: {
      allocationId: row.sourceAllocationId,
      paymentId: row.sourceAllocation.payment.id,
      paymentNo: row.sourceAllocation.payment.paymentNo,
      paymentStatus: row.sourceAllocation.payment.status,
      statementId: row.sourceAllocation.statement.id,
      statementNo: row.sourceAllocation.statement.statementNo,
      statementStatus: row.sourceAllocation.statement.status,
      effectiveAmountCents: serializeMinorAmount(effectiveAllocationAmount(row.sourceAllocation)),
    },
    replacement: {
      statementId: row.replacementStatement.id,
      statementNo: row.replacementStatement.statementNo,
      statementStatus: row.replacementStatement.status,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertAdjustmentScope(actor: FinanceActor, actionKey: string, row: AllocationAdjustmentRow) {
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey });
  const allowed = plan.allows(targetFor(row.sourceAllocation.payment))
    && plan.allows(targetFor(row.sourceAllocation.statement))
    && plan.allows(targetFor(row.replacementStatement));
  if (!allowed) {
    // A uniform 404 keeps a guessed adjustment ID from revealing another
    // department's financial workflow.
    throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_NOT_FOUND", "核销调整不存在或不在当前授权范围内。", 404);
  }
}

async function findAdjustmentForActor(actor: FinanceActor, id: string, actionKey: string) {
  const row = await prisma.financePaymentAllocationAdjustment.findFirst({
    where: {
      id,
      legalEntityId: actor.membership.legalEntityId,
      businessUnitId: actor.membership.businessUnitId,
    },
    include: adjustmentInclude,
  });
  if (!row) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_NOT_FOUND", "核销调整不存在或不在当前业务板块。", 404);
  await assertAdjustmentScope(actor, actionKey, row);
  return row;
}

async function findSourceForRequest(actor: FinanceActor, allocationId: string, replacementStatementId: string) {
  const [source, replacement] = await Promise.all([
    prisma.financePaymentAllocation.findFirst({
      where: {
        id: allocationId,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
      },
      include: {
        effects: { select: { amountCents: true } },
        payment: {
          select: {
            id: true,
            legalEntityId: true,
            businessUnitId: true,
            departmentId: true,
            siteId: true,
            createdByMembershipId: true,
            paymentNo: true,
            status: true,
            counterpartyId: true,
            currency: true,
            currencyScale: true,
            createdByMembership: { select: { userId: true } },
            approvedByMembership: { select: { userId: true } },
          },
        },
        statement: {
          select: {
            id: true,
            legalEntityId: true,
            businessUnitId: true,
            departmentId: true,
            siteId: true,
            createdByMembershipId: true,
            statementNo: true,
            status: true,
            counterpartyId: true,
            currency: true,
            currencyScale: true,
          },
        },
      },
    }),
    prisma.financeStatement.findFirst({
      where: {
        id: replacementStatementId,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
      },
      select: {
        id: true,
        legalEntityId: true,
        businessUnitId: true,
        departmentId: true,
        siteId: true,
        createdByMembershipId: true,
        statementNo: true,
        status: true,
        counterpartyId: true,
        currency: true,
        currencyScale: true,
      },
    }),
  ]);
  if (!source || !replacement) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_SOURCE_NOT_FOUND", "原核销或替代结算单不存在或不在当前授权范围内。", 404);

  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.allocation_adjustment.request" });
  if (!plan.allows(targetFor(source.payment)) || !plan.allows(targetFor(source.statement)) || !plan.allows(targetFor(replacement))) {
    throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_SOURCE_NOT_FOUND", "原核销或替代结算单不存在或不在当前授权范围内。", 404);
  }
  return { source, replacement };
}

function validateAdjustmentSources(input: {
  source: Awaited<ReturnType<typeof findSourceForRequest>>["source"];
  replacement: Awaited<ReturnType<typeof findSourceForRequest>>["replacement"];
}) {
  const { source, replacement } = input;
  if (source.payment.status !== FinancePaymentStatus.APPROVED
    || source.statement.status !== FinanceStatementStatus.APPROVED
    || replacement.status !== FinanceStatementStatus.APPROVED) {
    throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_SOURCE_NOT_APPROVED", "仅可调整付款、原结算单和替代结算单均为已批准的核销。已过账事实必须走后续会计更正流程。", 409);
  }
  if (source.statement.id === replacement.id) {
    throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_SAME_STATEMENT", "替代结算单必须与原结算单不同。", 400);
  }
  if (source.payment.counterpartyId !== replacement.counterpartyId
    || source.payment.currency !== replacement.currency
    || source.payment.currencyScale !== replacement.currencyScale) {
    throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_REPLACEMENT_MISMATCH", "替代结算单必须与原核销的付款保持相同结算对象、币种和精度。", 400);
  }
  if (effectiveAllocationAmount(source) !== source.amountCents) {
    throw new FinanceServiceError("ALLOCATION_ALREADY_ADJUSTED", "原核销已存在生效的调整，不能再次调整。", 409);
  }
}

async function withSerializationRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        if (attempt === 0) continue;
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_CONCURRENT_MODIFICATION", "核销调整刚被其他人员处理，请刷新后重试。", 409);
      }
      throw error;
    }
  }
  throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_CONCURRENT_MODIFICATION", "核销调整刚被其他人员处理，请刷新后重试。", 409);
}

export async function createAllocationAdjustment(actor: FinanceActor, allocationId: string, input: {
  replacementStatementId?: unknown;
  reason?: unknown;
  idempotencyKey?: unknown;
}) {
  const replacementStatementId = requiredText(input.replacementStatementId, "替代结算单", 1, 80);
  const reason = requiredText(input.reason, "调整原因", 3, 1000);
  const idempotencyKey = adjustmentIdempotencyKey(input.idempotencyKey);
  const initial = await findSourceForRequest(actor, allocationId, replacementStatementId);
  validateAdjustmentSources(initial);

  try {
    return await withSerializationRetry(async () => prisma.$transaction(async (tx) => {
    const source = await tx.financePaymentAllocation.findFirst({
      where: {
        id: allocationId,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
      },
      include: {
        effects: { select: { amountCents: true } },
        payment: {
          select: {
            id: true,
            legalEntityId: true,
            businessUnitId: true,
            departmentId: true,
            siteId: true,
            createdByMembershipId: true,
            paymentNo: true,
            status: true,
            counterpartyId: true,
            currency: true,
            currencyScale: true,
            createdByMembership: { select: { userId: true } },
            approvedByMembership: { select: { userId: true } },
          },
        },
        statement: {
          select: {
            id: true,
            legalEntityId: true,
            businessUnitId: true,
            departmentId: true,
            siteId: true,
            createdByMembershipId: true,
            statementNo: true,
            status: true,
            counterpartyId: true,
            currency: true,
            currencyScale: true,
          },
        },
      },
    });
    const replacement = await tx.financeStatement.findFirst({
      where: {
        id: replacementStatementId,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
      },
      select: {
        id: true,
        legalEntityId: true,
        businessUnitId: true,
        departmentId: true,
        siteId: true,
        createdByMembershipId: true,
        statementNo: true,
        status: true,
        counterpartyId: true,
        currency: true,
        currencyScale: true,
      },
    });
    if (!source || !replacement) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_SOURCE_NOT_FOUND", "原核销或替代结算单不存在或已变化。", 404);
    const requestPlan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.allocation_adjustment.request" });
    if (!requestPlan.allows(targetFor(source.payment))
      || !requestPlan.allows(targetFor(source.statement))
      || !requestPlan.allows(targetFor(replacement))) {
      throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_SOURCE_NOT_FOUND", "原核销或替代结算单不存在或不在当前授权范围内。", 404);
    }
    validateAdjustmentSources({ source, replacement });

    const existing = await tx.financePaymentAllocationAdjustment.findUnique({
      where: { sourceAllocationId_idempotencyKey: { sourceAllocationId: source.id, idempotencyKey } },
      include: adjustmentInclude,
    });
    if (existing) {
      if (existing.replacementStatementId !== replacement.id || existing.reason !== reason) {
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_IDEMPOTENCY_KEY_REUSED", "该调整幂等键已用于另一项申请，不能复用。", 409);
      }
      return { adjustment: dto(existing), created: false };
    }

    const open = await tx.financePaymentAllocationAdjustment.findFirst({
      where: {
        sourceAllocationId: source.id,
        status: { in: [FinancePaymentAllocationAdjustmentStatus.PENDING, FinancePaymentAllocationAdjustmentStatus.APPROVED] },
      },
      select: { id: true },
    });
    if (open) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_ALREADY_OPEN", "该原核销已有待审核或待执行的调整申请。", 409);

    const adjustment = await tx.financePaymentAllocationAdjustment.create({
      data: {
        id: randomUUID(),
        legalEntityId: source.legalEntityId,
        businessUnitId: source.businessUnitId,
        sourceAllocationId: source.id,
        replacementStatementId: replacement.id,
        amountCents: source.amountCents,
        reason,
        idempotencyKey,
        requestedByMembershipId: actor.membership.id,
      },
      include: adjustmentInclude,
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: adjustment.legalEntityId,
      businessUnitId: adjustment.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.allocation_adjustment",
      action: "finance.allocation_adjustment.request",
      targetType: "finance_payment_allocation_adjustment",
      targetId: adjustment.id,
      details: {
        sourceAllocationId: adjustment.sourceAllocationId,
        sourcePaymentId: source.payment.id,
        sourceStatementId: source.statement.id,
        replacementStatementId: replacement.id,
        amountCents: adjustment.amountCents.toString(),
        reason,
      },
    }, tx);
    return { adjustment: dto(adjustment), created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;

    // A concurrent retry can lose the unique-index race after its first read.
    // Re-read the immutable request and turn that database fact into the same
    // idempotent response the normal path would have returned.
    const replay = await prisma.financePaymentAllocationAdjustment.findUnique({
      where: { sourceAllocationId_idempotencyKey: { sourceAllocationId: allocationId, idempotencyKey } },
      include: adjustmentInclude,
    });
    if (replay) {
      await assertAdjustmentScope(actor, "finance.allocation_adjustment.request", replay);
      if (replay.replacementStatementId !== replacementStatementId || replay.reason !== reason) {
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_IDEMPOTENCY_KEY_REUSED", "该调整幂等键已用于另一项申请，不能复用。", 409);
      }
      return { adjustment: dto(replay), created: false };
    }
    const open = await prisma.financePaymentAllocationAdjustment.findFirst({
      where: {
        sourceAllocationId: allocationId,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        status: { in: [FinancePaymentAllocationAdjustmentStatus.PENDING, FinancePaymentAllocationAdjustmentStatus.APPROVED] },
      },
      select: { id: true },
    });
    if (open) {
      throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_ALREADY_OPEN", "该原核销已有待审核或待执行的调整申请。", 409);
    }
    throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_UNIQUE_CONFLICT", "核销调整刚被其他人员处理，请刷新后重试。", 409);
  }
}

/**
 * A deliberately narrow candidate list for the adjustment workbench. It only
 * exposes whole, still-effective APPROVED allocations that the requesting
 * user may read for both the payment and source statement. Pagination is
 * applied in the database; a broad in-memory list would be both slow and a
 * scope-leak risk.
 */
export async function listAdjustableAllocations(actor: FinanceActor, input: {
  page: number;
  pageSize: number;
  query?: string | null;
}) {
  const pagination = normalizedPagination(input.page, input.pageSize);
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.allocation_adjustment.request" });
  if (!plan.canAccessPayments || !plan.canAccessStatements) {
    throw new FinanceServiceError("FORBIDDEN", "当前角色没有申请核销调整所需的付款和结算单范围权限。", 403);
  }
  const query = input.query?.trim() ?? "";
  const filters: Prisma.FinancePaymentAllocationWhereInput = {
    legalEntityId: actor.membership.legalEntityId,
    businessUnitId: actor.membership.businessUnitId,
    payment: { is: { status: FinancePaymentStatus.APPROVED } },
    statement: { is: { status: FinanceStatementStatus.APPROVED } },
    effects: { none: {} },
    sourceAdjustments: {
      none: {
        status: {
          in: [
            FinancePaymentAllocationAdjustmentStatus.PENDING,
            FinancePaymentAllocationAdjustmentStatus.APPROVED,
            FinancePaymentAllocationAdjustmentStatus.APPLIED,
          ],
        },
      },
    },
    ...(query
      ? {
        OR: [
          { payment: { is: { paymentNo: { contains: query, mode: "insensitive" } } } },
          { statement: { is: { statementNo: { contains: query, mode: "insensitive" } } } },
        ],
      }
      : {}),
  };
  const scopeWhere: Prisma.FinancePaymentAllocationWhereInput = {
    payment: { is: plan.paymentWhere },
    statement: { is: plan.statementWhere },
  };
  const where: Prisma.FinancePaymentAllocationWhereInput = { AND: [filters, scopeWhere] };
  const include = {
    payment: { select: { id: true, paymentNo: true, currency: true, currencyScale: true } },
    statement: { select: { id: true, statementNo: true } },
  };
  const [rows, total] = await prisma.$transaction([
    prisma.financePaymentAllocation.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
    prisma.financePaymentAllocation.count({ where }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      amountCents: serializeMinorAmount(row.amountCents),
      amountLabel: formatMinorAmount(row.amountCents, row.payment.currency, row.payment.currencyScale),
      payment: { id: row.payment.id, paymentNo: row.payment.paymentNo },
      statement: { id: row.statement.id, statementNo: row.statement.statementNo },
    })),
    total,
  };
}

/**
 * Replacement statements are queried only after the source allocation has
 * passed the same live request scope. This avoids using a general statement
 * endpoint as a side channel for accounts that cannot request an adjustment.
 */
export async function listReplacementStatementOptions(actor: FinanceActor, allocationId: string, input: {
  page: number;
  pageSize: number;
  query?: string | null;
}) {
  const pagination = normalizedPagination(input.page, input.pageSize);
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.allocation_adjustment.request" });
  if (!plan.canAccessPayments || !plan.canAccessStatements) {
    throw new FinanceServiceError("FORBIDDEN", "当前角色没有申请核销调整所需的付款和结算单范围权限。", 403);
  }
  const source = await prisma.financePaymentAllocation.findFirst({
    where: {
      id: allocationId,
      legalEntityId: actor.membership.legalEntityId,
      businessUnitId: actor.membership.businessUnitId,
    },
    include: {
      effects: { select: { amountCents: true } },
      payment: {
        select: {
          id: true,
          legalEntityId: true,
          businessUnitId: true,
          departmentId: true,
          siteId: true,
          createdByMembershipId: true,
          paymentNo: true,
          status: true,
          counterpartyId: true,
          currency: true,
          currencyScale: true,
        },
      },
      statement: {
        select: {
          id: true,
          legalEntityId: true,
          businessUnitId: true,
          departmentId: true,
          siteId: true,
          createdByMembershipId: true,
          statementNo: true,
          status: true,
        },
      },
    },
  });
  if (!source
    || !plan.allows(targetFor(source.payment))
    || !plan.allows(targetFor(source.statement))) {
    throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_SOURCE_NOT_FOUND", "原核销不存在或不在当前授权范围内。", 404);
  }
  if (source.payment.status !== FinancePaymentStatus.APPROVED
    || source.statement.status !== FinanceStatementStatus.APPROVED
    || effectiveAllocationAmount(source) !== source.amountCents) {
    throw new FinanceServiceError("ALLOCATION_NOT_ADJUSTABLE", "该核销已不符合调整条件，请刷新后重试。", 409);
  }

  const query = input.query?.trim() ?? "";
  const filters: Prisma.FinanceStatementWhereInput = {
    legalEntityId: actor.membership.legalEntityId,
    businessUnitId: actor.membership.businessUnitId,
    status: FinanceStatementStatus.APPROVED,
    counterpartyId: source.payment.counterpartyId,
    currency: source.payment.currency,
    currencyScale: source.payment.currencyScale,
    id: { not: source.statement.id },
    ...(query ? { statementNo: { contains: query, mode: "insensitive" } } : {}),
  };
  const where: Prisma.FinanceStatementWhereInput = { AND: [plan.statementWhere, filters] };
  const [rows, total] = await prisma.$transaction([
    prisma.financeStatement.findMany({
      where,
      select: {
        id: true,
        statementNo: true,
        totalAmountCents: true,
        currency: true,
        currencyScale: true,
        paymentAllocations: {
          select: {
            id: true,
            amountCents: true,
            payment: { select: { status: true } },
            effects: { select: { amountCents: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
    prisma.financeStatement.count({ where }),
  ]);
  return {
    source: {
      allocationId: source.id,
      paymentNo: source.payment.paymentNo,
      statementNo: source.statement.statementNo,
      amountCents: serializeMinorAmount(source.amountCents),
      amountLabel: formatMinorAmount(source.amountCents, source.payment.currency, source.payment.currencyScale),
    },
    statements: rows.map((row) => {
      const allocatedAmountCents = row.paymentAllocations
        .filter((allocation) => allocation.payment.status !== FinancePaymentStatus.VOIDED)
        .reduce((sum, allocation) => sum + effectiveAllocationAmount(allocation), BigInt(0));
      const availableAmountCents = row.totalAmountCents - allocatedAmountCents;
      return {
        id: row.id,
        statementNo: row.statementNo,
        totalAmountCents: serializeMinorAmount(row.totalAmountCents),
        totalAmountLabel: formatMinorAmount(row.totalAmountCents, row.currency, row.currencyScale),
        availableAmountCents: serializeMinorAmount(availableAmountCents),
        availableAmountLabel: formatMinorAmount(availableAmountCents, row.currency, row.currencyScale),
        canCoverAdjustment: availableAmountCents >= source.amountCents,
      };
    }),
    total,
  };
}

export async function transitionAllocationAdjustment(actor: FinanceActor, adjustmentId: string, input: { command?: unknown; reason?: unknown }) {
  const command = parseCommand(input.command);
  const actionKey = actionForCommand(command);
  await findAdjustmentForActor(actor, adjustmentId, actionKey);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if ((command === "reject" || command === "cancel") && (reason.length < 3 || reason.length > 1000)) {
    throw new FinanceServiceError("INVALID_ALLOCATION_ADJUSTMENT_REASON", "驳回或取消核销调整必须填写 3 到 1000 个字符的原因。", 400);
  }

  return withSerializationRetry(async () => prisma.$transaction(async (tx) => {
    const current = await tx.financePaymentAllocationAdjustment.findFirst({
      where: {
        id: adjustmentId,
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
      },
      include: adjustmentInclude,
    });
    if (!current) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_NOT_FOUND", "核销调整不存在或已变化。", 404);
    await assertAdjustmentScope(actor, actionKey, current);

    const now = new Date();
    if (command === "approve") {
      if (current.status !== FinancePaymentAllocationAdjustmentStatus.PENDING) {
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "仅待审核的核销调整可以批准。", 409);
      }
      validateAdjustmentSources({ source: current.sourceAllocation, replacement: current.replacementStatement });
      const policy = resolveFinanceSegregationPolicy(await tx.financeControlPolicy.findUnique({
        where: { businessUnitId: current.businessUnitId },
      }));
      const separation = checkFinanceSegregation({
        command: "allocation_adjustment.approve",
        actorUserId: actor.userId,
        subject: { createdByUserId: current.requestedByMembership.userId },
        policy,
      });
      if (!separation.allowed) throw new FinanceServiceError(separation.code, separation.message, 409);
      const updated = await tx.financePaymentAllocationAdjustment.updateMany({
        where: { id: current.id, status: FinancePaymentAllocationAdjustmentStatus.PENDING },
        data: { status: FinancePaymentAllocationAdjustmentStatus.APPROVED, approvedByMembershipId: actor.membership.id, approvedAt: now, approvalReason: reason || null },
      });
      if (updated.count !== 1) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "核销调整刚被其他人员处理，请刷新后重试。", 409);
    } else if (command === "reject") {
      if (current.status !== FinancePaymentAllocationAdjustmentStatus.PENDING) {
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "仅待审核的核销调整可以驳回。", 409);
      }
      const policy = resolveFinanceSegregationPolicy(await tx.financeControlPolicy.findUnique({
        where: { businessUnitId: current.businessUnitId },
      }));
      const separation = checkFinanceSegregation({
        command: "allocation_adjustment.approve",
        actorUserId: actor.userId,
        subject: { createdByUserId: current.requestedByMembership.userId },
        policy,
      });
      if (!separation.allowed) throw new FinanceServiceError(separation.code, separation.message, 409);
      const updated = await tx.financePaymentAllocationAdjustment.updateMany({
        where: { id: current.id, status: FinancePaymentAllocationAdjustmentStatus.PENDING },
        data: { status: FinancePaymentAllocationAdjustmentStatus.REJECTED, rejectedByMembershipId: actor.membership.id, rejectedAt: now, rejectionReason: reason },
      });
      if (updated.count !== 1) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "核销调整刚被其他人员处理，请刷新后重试。", 409);
    } else if (command === "cancel") {
      if (current.status !== FinancePaymentAllocationAdjustmentStatus.PENDING
        && current.status !== FinancePaymentAllocationAdjustmentStatus.APPROVED) {
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "仅待审核或已批准的核销调整可以取消。", 409);
      }
      const updated = await tx.financePaymentAllocationAdjustment.updateMany({
        where: { id: current.id, status: current.status },
        data: { status: FinancePaymentAllocationAdjustmentStatus.CANCELLED, cancelledByMembershipId: actor.membership.id, cancelledAt: now, cancellationReason: reason },
      });
      if (updated.count !== 1) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "核销调整刚被其他人员处理，请刷新后重试。", 409);
    } else {
      if (current.status !== FinancePaymentAllocationAdjustmentStatus.APPROVED) {
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "仅已批准的核销调整可以执行。", 409);
      }
      validateAdjustmentSources({ source: current.sourceAllocation, replacement: current.replacementStatement });
      const policy = resolveFinanceSegregationPolicy(await tx.financeControlPolicy.findUnique({
        where: { businessUnitId: current.businessUnitId },
      }));
      const separation = checkFinanceSegregation({
        command: "allocation_adjustment.apply",
        actorUserId: actor.userId,
        subject: {
          createdByUserId: current.requestedByMembership.userId,
          approvedByUserId: current.approvedByMembership?.userId ?? null,
        },
        policy,
      });
      if (!separation.allowed) throw new FinanceServiceError(separation.code, separation.message, 409);

      // Approval is not a reservation. Re-read the replacement statement and
      // its effective allocations inside this serializable transaction so a
      // later allocation cannot turn the adjustment into an over-allocation.
      const currentReplacement = await tx.financeStatement.findFirst({
        where: {
          id: current.replacementStatementId,
          legalEntityId: current.legalEntityId,
          businessUnitId: current.businessUnitId,
          status: FinanceStatementStatus.APPROVED,
        },
        include: {
          paymentAllocations: {
            include: {
              payment: { select: { status: true } },
              effects: { select: { amountCents: true } },
            },
          },
        },
      });
      if (!currentReplacement) {
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "替代结算单状态已变化，请刷新后重试。", 409);
      }
      const usedByReplacement = currentReplacement.paymentAllocations
        .filter((allocation) => allocation.payment.status !== FinancePaymentStatus.VOIDED)
        .reduce((sum, allocation) => sum + effectiveAllocationAmount(allocation), BigInt(0));
      if (usedByReplacement + current.amountCents > currentReplacement.totalAmountCents) {
        throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_REPLACEMENT_OVER_ALLOCATED", "替代结算单可用余额不足，不能执行核销调整。", 409);
      }

      const replacementAllocation = await tx.financePaymentAllocation.create({
        data: {
          id: randomUUID(),
          legalEntityId: current.legalEntityId,
          businessUnitId: current.businessUnitId,
          paymentId: current.sourceAllocation.payment.id,
          statementId: current.replacementStatementId,
          idempotencyKey: `adjustment:${current.id}`,
          amountCents: current.amountCents,
          createdByMembershipId: actor.membership.id,
        },
      });
      const updated = await tx.financePaymentAllocationAdjustment.updateMany({
        where: { id: current.id, status: FinancePaymentAllocationAdjustmentStatus.APPROVED },
        data: {
          status: FinancePaymentAllocationAdjustmentStatus.APPLIED,
          appliedByMembershipId: actor.membership.id,
          appliedAt: now,
          replacementAllocationId: replacementAllocation.id,
        },
      });
      if (updated.count !== 1) throw new FinanceServiceError("ALLOCATION_ADJUSTMENT_STALE", "核销调整刚被其他人员处理，请刷新后重试。", 409);
      await tx.financePaymentAllocationEffect.create({
        data: {
          id: randomUUID(),
          legalEntityId: current.legalEntityId,
          businessUnitId: current.businessUnitId,
          allocationId: current.sourceAllocationId,
          adjustmentId: current.id,
          type: FinancePaymentAllocationEffectType.REVERSAL,
          amountCents: current.amountCents,
          appliedByMembershipId: actor.membership.id,
          appliedAt: now,
        },
      });
    }

    const next = await tx.financePaymentAllocationAdjustment.findUniqueOrThrow({
      where: { id: current.id },
      include: adjustmentInclude,
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: next.legalEntityId,
      businessUnitId: next.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.allocation_adjustment",
      action: actionKey,
      targetType: "finance_payment_allocation_adjustment",
      targetId: next.id,
      details: {
        command,
        from: current.status,
        to: next.status,
        sourceAllocationId: next.sourceAllocationId,
        replacementStatementId: next.replacementStatementId,
        replacementAllocationId: next.replacementAllocationId,
        amountCents: next.amountCents.toString(),
        reason: reason || null,
      },
    }, tx);
    return dto(next);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export async function getAllocationAdjustment(actor: FinanceActor, id: string) {
  const row = await findAdjustmentForActor(actor, id, "finance.allocation_adjustment.read");
  return dto(row);
}

export async function listAllocationAdjustments(actor: FinanceActor, input: {
  page: number;
  pageSize: number;
  status?: string | null;
  query?: string | null;
}) {
  const pagination = normalizedPagination(input.page, input.pageSize);
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.allocation_adjustment.read" });
  if (!plan.allowed) throw new FinanceServiceError("FORBIDDEN", "当前角色没有查看核销调整的权限。", 403);
  const status = input.status && Object.values(FinancePaymentAllocationAdjustmentStatus).includes(input.status as FinancePaymentAllocationAdjustmentStatus)
    ? input.status as FinancePaymentAllocationAdjustmentStatus
    : null;
  if (input.status && !status) throw new FinanceServiceError("INVALID_ALLOCATION_ADJUSTMENT_STATUS", "核销调整状态筛选不正确。", 400);
  const query = input.query?.trim().toLowerCase() ?? "";
  const filters: Prisma.FinancePaymentAllocationAdjustmentWhereInput = {
    legalEntityId: actor.membership.legalEntityId,
    businessUnitId: actor.membership.businessUnitId,
    ...(status ? { status } : {}),
    ...(query
      ? {
        OR: [
          { id: { contains: query, mode: "insensitive" } },
          { sourceAllocation: { is: { payment: { is: { paymentNo: { contains: query, mode: "insensitive" } } } } } },
          { sourceAllocation: { is: { statement: { is: { statementNo: { contains: query, mode: "insensitive" } } } } } },
          { replacementStatement: { is: { statementNo: { contains: query, mode: "insensitive" } } } },
        ],
      }
      : {}),
  };
  const scopeWhere: Prisma.FinancePaymentAllocationAdjustmentWhereInput = {
    sourceAllocation: {
      is: {
        payment: { is: plan.paymentWhere },
        statement: { is: plan.statementWhere },
      },
    },
    replacementStatement: { is: plan.statementWhere },
  };
  const where: Prisma.FinancePaymentAllocationAdjustmentWhereInput = { AND: [filters, scopeWhere] };
  const [rows, total] = await prisma.$transaction([
    prisma.financePaymentAllocationAdjustment.findMany({
      where,
      include: adjustmentInclude,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
    }),
    prisma.financePaymentAllocationAdjustment.count({ where }),
  ]);
  return {
    items: rows.map(dto),
    total,
    pageCount: Math.ceil(total / pagination.pageSize),
  };
}
