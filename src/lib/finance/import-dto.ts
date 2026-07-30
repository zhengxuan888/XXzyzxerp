import { formatMinorAmount, serializeMinorAmount } from "@/lib/finance/money";

type TemplateLike = {
  id: string;
  legalEntityId: string;
  businessUnitId: string;
  departmentId: string | null;
  counterpartyId: string | null;
  code: string;
  name: string;
  description: string | null;
  configuration: unknown;
  version: number;
  isActive: boolean;
  createdByMembershipId: string;
  createdAt: Date;
  updatedAt: Date;
};

export function financeStatementTemplateDto(row: TemplateLike) {
  return {
    id: row.id,
    legalEntityId: row.legalEntityId,
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    counterpartyId: row.counterpartyId,
    code: row.code,
    name: row.name,
    description: row.description,
    configuration: row.configuration,
    version: row.version,
    isActive: row.isActive,
    createdByMembershipId: row.createdByMembershipId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type ImportRowLike = {
  id: string;
  rowNumber: number;
  sourceRowHash: string;
  status: string;
  issueCodes: unknown;
  message: string | null;
  sourceReference: string | null;
  trackingReference: string | null;
  description: string | null;
  currency: string | null;
  currencyScale: number | null;
  amountCents: bigint | null;
  importedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function financeStatementImportRowDto(row: ImportRowLike) {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    sourceRowHash: row.sourceRowHash,
    status: row.status,
    issueCodes: row.issueCodes ?? [],
    message: row.message,
    sourceReference: row.sourceReference,
    trackingReference: row.trackingReference,
    description: row.description,
    currency: row.currency,
    currencyScale: row.currencyScale,
    amountCents: row.amountCents === null ? null : serializeMinorAmount(row.amountCents),
    amountLabel: row.amountCents === null || !row.currency || row.currencyScale === null
      ? null
      : formatMinorAmount(row.amountCents, row.currency, row.currencyScale),
    importedAt: row.importedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type ImportSheetLike = {
  id: string;
  sheetKey: string;
  sheetName: string;
  headerRowNumber: number;
  statementNo: string;
  statementType: string;
  currency: string;
  currencyScale: number;
  totalAmountCents: bigint;
  totalRows: number;
  readyRows: number;
  warningRows: number;
  rejectedRows: number;
  importedRows: number;
  createdStatementId: string | null;
  rows?: ImportRowLike[];
};

export function financeStatementImportSheetDto(row: ImportSheetLike) {
  return {
    id: row.id,
    sheetKey: row.sheetKey,
    sheetName: row.sheetName,
    headerRowNumber: row.headerRowNumber,
    statementNo: row.statementNo,
    statementType: row.statementType,
    currency: row.currency,
    currencyScale: row.currencyScale,
    totalAmountCents: serializeMinorAmount(row.totalAmountCents),
    totalAmountLabel: formatMinorAmount(row.totalAmountCents, row.currency, row.currencyScale),
    totalRows: row.totalRows,
    readyRows: row.readyRows,
    warningRows: row.warningRows,
    rejectedRows: row.rejectedRows,
    importedRows: row.importedRows,
    createdStatementId: row.createdStatementId,
    rows: row.rows?.map(financeStatementImportRowDto) ?? [],
  };
}

type ImportBatchLike = {
  id: string;
  legalEntityId: string;
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  templateId: string;
  templateVersion: number;
  counterpartyId: string;
  statementNoPrefix: string;
  externalReference: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  issuedAt: Date | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: string;
  totalRows: number;
  readyRows: number;
  warningRows: number;
  rejectedRows: number;
  importedRows: number;
  previewedByMembershipId: string;
  previewedAt: Date;
  confirmedByMembershipId: string | null;
  confirmedAt: Date | null;
  cancelledByMembershipId: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  template?: { id: string; code: string; name: string };
  counterparty?: { id: string; code: string; name: string; type: string };
  sheets?: ImportSheetLike[];
};

export function financeStatementImportBatchDto(row: ImportBatchLike) {
  return {
    id: row.id,
    legalEntityId: row.legalEntityId,
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    siteId: row.siteId,
    templateId: row.templateId,
    templateVersion: row.templateVersion,
    template: row.template ?? null,
    counterpartyId: row.counterpartyId,
    counterparty: row.counterparty ?? null,
    statementNoPrefix: row.statementNoPrefix,
    externalReference: row.externalReference,
    periodStart: row.periodStart?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    sourceFile: {
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
    },
    status: row.status,
    totalRows: row.totalRows,
    readyRows: row.readyRows,
    warningRows: row.warningRows,
    rejectedRows: row.rejectedRows,
    importedRows: row.importedRows,
    previewedByMembershipId: row.previewedByMembershipId,
    previewedAt: row.previewedAt.toISOString(),
    confirmedByMembershipId: row.confirmedByMembershipId,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    cancelledByMembershipId: row.cancelledByMembershipId,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sheets: row.sheets?.map(financeStatementImportSheetDto) ?? [],
  };
}
