import { formatMinorAmount, serializeMinorAmount } from "@/lib/finance/money";

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

type CounterpartyLike = {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  businessUnitId: string;
  departmentId: string | null;
  createdByMembershipId: string;
  createdAt: Date;
  updatedAt: Date;
};

export function financeCounterpartyDto(row: CounterpartyLike) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    isActive: row.isActive,
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    createdByMembershipId: row.createdByMembershipId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type ReconciliationLike = {
  id: string;
  orderId: string | null;
  shipmentId: string | null;
  amountCents: bigint;
  status: string;
  method: string;
  reason: string | null;
  createdByMembershipId: string;
  confirmedByMembershipId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
};

type StatementLineLike = {
  id: string;
  lineNo: number;
  orderId: string | null;
  shipmentId: string | null;
  sourceReference: string | null;
  description: string | null;
  currency: string;
  currencyScale: number;
  amountCents: bigint;
  reconciliationStatus: string;
  exceptionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  reconciliations?: ReconciliationLike[];
};

export function financeReconciliationDto(row: ReconciliationLike) {
  return {
    id: row.id,
    orderId: row.orderId,
    shipmentId: row.shipmentId,
    amountCents: serializeMinorAmount(row.amountCents),
    status: row.status,
    method: row.method,
    reason: row.reason,
    createdByMembershipId: row.createdByMembershipId,
    confirmedByMembershipId: row.confirmedByMembershipId,
    confirmedAt: iso(row.confirmedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export function financeStatementLineDto(row: StatementLineLike) {
  return {
    id: row.id,
    lineNo: row.lineNo,
    orderId: row.orderId,
    shipmentId: row.shipmentId,
    sourceReference: row.sourceReference,
    description: row.description,
    currency: row.currency,
    currencyScale: row.currencyScale,
    amountCents: serializeMinorAmount(row.amountCents),
    amountLabel: formatMinorAmount(row.amountCents, row.currency, row.currencyScale),
    reconciliationStatus: row.reconciliationStatus,
    exceptionReason: row.exceptionReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reconciliations: row.reconciliations?.map(financeReconciliationDto) ?? [],
  };
}

type StatementLike = {
  id: string;
  legalEntityId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  counterpartyId: string;
  statementNo: string;
  type: string;
  status: string;
  currency: string;
  currencyScale: number;
  totalAmountCents: bigint;
  periodStart: Date | null;
  periodEnd: Date | null;
  issuedAt: Date | null;
  confirmedAt: Date | null;
  approvedAt: Date | null;
  postedAt: Date | null;
  voidedAt: Date | null;
  externalReference: string | null;
  note: string | null;
  exceptionReason: string | null;
  createdByMembershipId: string;
  approvedByMembershipId: string | null;
  postedByMembershipId: string | null;
  voidedByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  counterparty?: Pick<CounterpartyLike, "id" | "code" | "name" | "type">;
  lines?: StatementLineLike[];
  _count?: { lines?: number; paymentAllocations?: number };
};

export function financeStatementDto(row: StatementLike) {
  return {
    id: row.id,
    legalEntityId: row.legalEntityId,
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    siteId: row.siteId,
    counterpartyId: row.counterpartyId,
    counterparty: row.counterparty ?? null,
    statementNo: row.statementNo,
    type: row.type,
    status: row.status,
    currency: row.currency,
    currencyScale: row.currencyScale,
    totalAmountCents: serializeMinorAmount(row.totalAmountCents),
    totalAmountLabel: formatMinorAmount(row.totalAmountCents, row.currency, row.currencyScale),
    periodStart: iso(row.periodStart),
    periodEnd: iso(row.periodEnd),
    issuedAt: iso(row.issuedAt),
    confirmedAt: iso(row.confirmedAt),
    approvedAt: iso(row.approvedAt),
    postedAt: iso(row.postedAt),
    voidedAt: iso(row.voidedAt),
    externalReference: row.externalReference,
    note: row.note,
    exceptionReason: row.exceptionReason,
    createdByMembershipId: row.createdByMembershipId,
    approvedByMembershipId: row.approvedByMembershipId,
    postedByMembershipId: row.postedByMembershipId,
    voidedByMembershipId: row.voidedByMembershipId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines?.map(financeStatementLineDto) ?? [],
    lineCount: row._count?.lines ?? row.lines?.length ?? 0,
    allocationCount: row._count?.paymentAllocations ?? 0,
  };
}

type PaymentAllocationLike = {
  id: string;
  statementId: string;
  amountCents: bigint;
  createdByMembershipId: string;
  createdAt: Date;
  statement?: { id: string; statementNo: string; currency: string; currencyScale: number };
};

type PaymentLike = {
  id: string;
  legalEntityId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  counterpartyId: string;
  paymentNo: string;
  direction: string;
  status: string;
  currency: string;
  currencyScale: number;
  amountCents: bigint;
  paidAt: Date | null;
  approvedAt: Date | null;
  postedAt: Date | null;
  voidedAt: Date | null;
  externalReference: string | null;
  note: string | null;
  voidReason: string | null;
  createdByMembershipId: string;
  approvedByMembershipId: string | null;
  postedByMembershipId: string | null;
  voidedByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  counterparty?: Pick<CounterpartyLike, "id" | "code" | "name" | "type">;
  allocations?: PaymentAllocationLike[];
};

export function financePaymentDto(row: PaymentLike) {
  return {
    id: row.id,
    legalEntityId: row.legalEntityId,
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    siteId: row.siteId,
    counterpartyId: row.counterpartyId,
    counterparty: row.counterparty ?? null,
    paymentNo: row.paymentNo,
    direction: row.direction,
    status: row.status,
    currency: row.currency,
    currencyScale: row.currencyScale,
    amountCents: serializeMinorAmount(row.amountCents),
    amountLabel: formatMinorAmount(row.amountCents, row.currency, row.currencyScale),
    paidAt: iso(row.paidAt),
    approvedAt: iso(row.approvedAt),
    postedAt: iso(row.postedAt),
    voidedAt: iso(row.voidedAt),
    externalReference: row.externalReference,
    note: row.note,
    voidReason: row.voidReason,
    createdByMembershipId: row.createdByMembershipId,
    approvedByMembershipId: row.approvedByMembershipId,
    postedByMembershipId: row.postedByMembershipId,
    voidedByMembershipId: row.voidedByMembershipId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    allocations: (row.allocations ?? []).map((allocation) => ({
      id: allocation.id,
      statementId: allocation.statementId,
      statementNo: allocation.statement?.statementNo ?? null,
      amountCents: serializeMinorAmount(allocation.amountCents),
      amountLabel: formatMinorAmount(allocation.amountCents, row.currency, row.currencyScale),
      createdByMembershipId: allocation.createdByMembershipId,
      createdAt: allocation.createdAt.toISOString(),
    })),
  };
}
