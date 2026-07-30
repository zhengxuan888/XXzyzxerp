import { createHash } from "node:crypto";

import {
  FinanceStatementImportBatchStatus,
  FinanceStatementImportRowStatus,
  Prisma,
} from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { createFinanceAccessPlan, type FinanceAccessMembership, type FinanceAccessTarget } from "@/lib/finance/access";
import { financeStatementImportBatchDto, financeStatementTemplateDto } from "@/lib/finance/import-dto";
import {
  FinanceStatementTemplateValidationError,
  normalizeFinanceTemplateCode,
  parseFinanceStatementTemplateConfiguration,
} from "@/lib/finance/import-template";
import { FinanceStatementWorkbookError, previewFinanceStatementWorkbook } from "@/lib/finance/import-workbook";
import { FinanceServiceError } from "@/lib/finance/settlement-service";
import { preparePrivateSpreadsheetArtifact } from "@/lib/logistics-spreadsheet";
import { prisma } from "@/lib/prisma";
import { localDemoStorage } from "@/lib/storage/local-demo";

export type FinanceImportActor = {
  userId: string;
  membership: FinanceAccessMembership & { legalEntityId: string };
};

export type FinanceWorkbookUpload = {
  name: string;
  bytes: Uint8Array;
};

const importBatchInclude = {
  template: { select: { id: true, code: true, name: true } },
  counterparty: { select: { id: true, code: true, name: true, type: true } },
  sheets: {
    orderBy: [{ sheetKey: "asc" as const }],
    include: { rows: { orderBy: [{ rowNumber: "asc" as const }] } },
  },
} satisfies Prisma.FinanceStatementImportBatchInclude;

function requiredText(value: unknown, field: string, max: number) {
  if (typeof value !== "string") throw new FinanceServiceError("INVALID_INPUT", `${field} 为必填项。`, 400);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || normalized.includes("\0")) {
    throw new FinanceServiceError("INVALID_INPUT", `${field} 长度或格式不正确。`, 400);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, max: number) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, field, max);
}

function optionalIdentifier(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return requiredText(value, field, 80);
}

function optionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 80) {
    throw new FinanceServiceError("INVALID_DATE", `${field} 格式不正确。`, 400);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new FinanceServiceError("INVALID_DATE", `${field} 格式不正确。`, 400);
  return date;
}

function validatePeriod(periodStart: Date | null, periodEnd: Date | null) {
  if (periodStart && periodEnd && periodStart.getTime() > periodEnd.getTime()) {
    throw new FinanceServiceError("INVALID_PERIOD", "账单开始日期不能晚于结束日期。", 400);
  }
}

function sameNullableDate(left: Date | null, right: Date | null) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function matchesExistingPreview(
  batch: {
    templateId: string;
    templateVersion: number;
    statementNoPrefix: string;
    externalReference: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    issuedAt: Date | null;
  },
  input: {
    templateId: string;
    templateVersion: number;
    statementNoPrefix: string;
    externalReference: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    issuedAt: Date | null;
  },
) {
  return batch.templateId === input.templateId
    && batch.templateVersion === input.templateVersion
    && batch.statementNoPrefix === input.statementNoPrefix
    && batch.externalReference === input.externalReference
    && sameNullableDate(batch.periodStart, input.periodStart)
    && sameNullableDate(batch.periodEnd, input.periodEnd)
    && sameNullableDate(batch.issuedAt, input.issuedAt);
}

function actorTarget(actor: FinanceImportActor, departmentId = actor.membership.departmentId, siteId = actor.membership.siteId): FinanceAccessTarget {
  return {
    businessUnitId: actor.membership.businessUnitId,
    departmentId,
    siteId,
    ownerMembershipId: actor.membership.id,
  };
}

function templateTarget(row: {
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

function batchTarget(row: {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  previewedByMembershipId: string;
}): FinanceAccessTarget {
  return {
    businessUnitId: row.businessUnitId,
    departmentId: row.departmentId,
    siteId: row.siteId,
    ownerMembershipId: row.previewedByMembershipId,
  };
}

function counterpartyTarget(row: {
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

function normalizeTemplateConfiguration(value: unknown) {
  try {
    return parseFinanceStatementTemplateConfiguration(value);
  } catch (error) {
    if (error instanceof FinanceStatementTemplateValidationError) {
      throw new FinanceServiceError(error.code, error.message, 400);
    }
    throw error;
  }
}

function normalizeTemplateCode(value: unknown) {
  try {
    return normalizeFinanceTemplateCode(value);
  } catch (error) {
    if (error instanceof FinanceStatementTemplateValidationError) {
      throw new FinanceServiceError(error.code, error.message, 400);
    }
    throw error;
  }
}

function workbookError(error: unknown) {
  if (error instanceof FinanceStatementWorkbookError) {
    const messages: Record<string, string> = {
      WORKBOOK_HAS_NO_SHEET: "工作簿没有可读取的工作表。",
      WORKBOOK_SHEET_LIMIT_EXCEEDED: "工作簿工作表数量超过安全预检上限。",
      WORKBOOK_DIMENSION_LIMIT_EXCEEDED: "工作簿行数或列数超过安全预检上限。",
      TEMPLATE_SHEET_NOT_FOUND: "未找到模板配置的工作表，请检查模板或上传正确的文件。",
      TEMPLATE_SHEET_AMBIGUOUS: "模板工作表别名匹配到多个工作表，请收窄模板配置。",
      TEMPLATE_SHEET_REUSED: "同一工作表被多个模板规则使用，不能预检。",
      REQUIRED_COLUMNS_MISSING: "未识别到模板要求的必填表头。",
      HEADER_COLUMN_AMBIGUOUS: "模板别名匹配到多个表头列，请收窄模板配置。",
      HEADER_MAPPING_COLLISION: "模板把同一表头映射给多个字段，不能预检。",
      HEADER_ROW_AMBIGUOUS: "匹配到多个候选表头行，请收窄模板扫描范围。",
      INVALID_STATEMENT_NO: "结算单号前缀与模板后缀组合不正确。",
      WORKBOOK_HAS_NO_IMPORT_ROWS: "工作簿没有可预检的账单行。",
      TOO_MANY_ROWS: "一次账单预检最多 5000 行。",
    };
    return new FinanceServiceError(error.code, messages[error.code] ?? "账单工作簿无法安全预检。", 400);
  }
  return error;
}

async function requireCounterparty(actor: FinanceImportActor, counterpartyId: string) {
  const counterparty = await prisma.financeCounterparty.findFirst({
    where: {
      id: counterpartyId,
      legalEntityId: actor.membership.legalEntityId,
      businessUnitId: actor.membership.businessUnitId,
      isActive: true,
    },
  });
  if (!counterparty) throw new FinanceServiceError("COUNTERPARTY_NOT_FOUND", "结算对象不存在、已停用或不属于当前业务板块。", 404);
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.counterparty.read" });
  if (!plan.canAccessCounterparties || !plan.allows(counterpartyTarget(counterparty))) {
    throw new FinanceServiceError("COUNTERPARTY_NOT_FOUND", "结算对象不存在或不在当前授权范围。", 404);
  }
  return counterparty;
}

async function requireTemplateAction(actor: FinanceImportActor, actionKey: string, row: {
  businessUnitId: string;
  departmentId: string | null;
  createdByMembershipId: string;
}) {
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey });
  if (!plan.canAccessImportTemplates || !plan.allows(templateTarget(row))) {
    throw new FinanceServiceError("FORBIDDEN", "当前岗位无权访问该账单模板。", 403);
  }
  return plan;
}

async function requireBatchAction(actor: FinanceImportActor, actionKey: string, row: {
  businessUnitId: string;
  departmentId: string | null;
  siteId: string | null;
  previewedByMembershipId: string;
}) {
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey });
  if (!plan.canAccessStatementImports || !plan.allows(batchTarget(row))) {
    throw new FinanceServiceError("FINANCE_IMPORT_NOT_FOUND", "账单导入批次不存在或不在当前授权范围。", 404);
  }
  return plan;
}

function importScope(actor: FinanceImportActor, counterparty: { departmentId: string | null }) {
  const departmentId = counterparty.departmentId ?? actor.membership.departmentId;
  const siteId = counterparty.departmentId && counterparty.departmentId !== actor.membership.departmentId
    ? null
    : actor.membership.siteId;
  return { departmentId, siteId };
}

export async function createFinanceStatementTemplate(actor: FinanceImportActor, input: {
  code?: unknown;
  name?: unknown;
  description?: unknown;
  configuration?: unknown;
  counterpartyId?: unknown;
}) {
  const code = normalizeTemplateCode(input.code);
  const name = requiredText(input.name, "模板名称", 160);
  const description = optionalText(input.description, "模板说明", 1000);
  const configuration = normalizeTemplateConfiguration(input.configuration);
  const counterpartyId = optionalIdentifier(input.counterpartyId, "结算对象");
  const scope = actorTarget(actor);
  const plan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.statement_template.manage" });
  if (!plan.canAccessImportTemplates || !plan.allowsCreate(scope)) {
    throw new FinanceServiceError("CREATE_SCOPE_FORBIDDEN", "当前岗位不能在此组织范围创建账单模板。", 403);
  }
  if (counterpartyId) await requireCounterparty(actor, counterpartyId);

  return prisma.$transaction(async (tx) => {
    const row = await tx.financeStatementTemplate.create({
      data: {
        legalEntityId: actor.membership.legalEntityId,
        businessUnitId: actor.membership.businessUnitId,
        departmentId: actor.membership.departmentId,
        counterpartyId,
        code,
        name,
        description,
        configuration: configuration as unknown as Prisma.InputJsonValue,
        createdByMembershipId: actor.membership.id,
      },
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: row.legalEntityId,
      businessUnitId: row.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.statement_template",
      action: "finance.statement_template.manage",
      targetType: "finance_statement_template",
      targetId: row.id,
      details: { code: row.code, version: row.version, counterpartyId: row.counterpartyId, sheetKeys: configuration.sheets.map((sheet) => sheet.key) },
    }, tx);
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateFinanceStatementTemplate(actor: FinanceImportActor, templateId: string, input: {
  name?: unknown;
  description?: unknown;
  configuration?: unknown;
  counterpartyId?: unknown;
  isActive?: unknown;
}) {
  const existing = await prisma.financeStatementTemplate.findFirst({
    where: { id: templateId, legalEntityId: actor.membership.legalEntityId, businessUnitId: actor.membership.businessUnitId },
  });
  if (!existing) throw new FinanceServiceError("TEMPLATE_NOT_FOUND", "账单模板不存在或不属于当前业务板块。", 404);
  await requireTemplateAction(actor, "finance.statement_template.manage", existing);
  const configuration = input.configuration === undefined ? null : normalizeTemplateConfiguration(input.configuration);
  const counterpartyId = optionalIdentifier(input.counterpartyId, "结算对象");
  if (counterpartyId !== undefined && counterpartyId !== null) await requireCounterparty(actor, counterpartyId);
  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    throw new FinanceServiceError("INVALID_INPUT", "isActive 必须是布尔值。", 400);
  }
  const data: Prisma.FinanceStatementTemplateUpdateInput = {
    ...(input.name === undefined ? {} : { name: requiredText(input.name, "模板名称", 160) }),
    ...(input.description === undefined ? {} : { description: optionalText(input.description, "模板说明", 1000) }),
    ...(configuration ? { configuration: configuration as unknown as Prisma.InputJsonValue } : {}),
    ...(counterpartyId === undefined
      ? {}
      : { counterparty: counterpartyId ? { connect: { id: counterpartyId } } : { disconnect: true } }),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    version: { increment: 1 },
  };
  return prisma.$transaction(async (tx) => {
    const row = await tx.financeStatementTemplate.update({ where: { id: existing.id }, data });
    await writeAuditLog({
      actorUserId: actor.userId,
      actorMembershipId: actor.membership.id,
      legalEntityId: row.legalEntityId,
      businessUnitId: row.businessUnitId,
      roleId: actor.membership.roleId,
      module: "finance.statement_template",
      action: "finance.statement_template.manage",
      targetType: "finance_statement_template",
      targetId: row.id,
      details: {
        code: row.code,
        fromVersion: existing.version,
        toVersion: row.version,
        isActive: row.isActive,
        configurationChanged: Boolean(configuration),
        counterpartyId: { from: existing.counterpartyId, to: row.counterpartyId },
        nameChanged: input.name !== undefined,
        descriptionChanged: input.description !== undefined,
      },
    }, tx);
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function previewFinanceStatementImport(actor: FinanceImportActor, input: {
  templateId?: unknown;
  counterpartyId?: unknown;
  statementNoPrefix?: unknown;
  externalReference?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  issuedAt?: unknown;
  file: FinanceWorkbookUpload;
}) {
  const templateId = requiredText(input.templateId, "账单模板", 80);
  const counterpartyId = requiredText(input.counterpartyId, "结算对象", 80);
  const statementNoPrefix = requiredText(input.statementNoPrefix, "结算单号前缀", 80);
  const externalReference = optionalText(input.externalReference, "外部参考号", 160);
  const periodStart = optionalDate(input.periodStart, "账单开始日期");
  const periodEnd = optionalDate(input.periodEnd, "账单结束日期");
  const issuedAt = optionalDate(input.issuedAt, "出账日期");
  validatePeriod(periodStart, periodEnd);
  const template = await prisma.financeStatementTemplate.findFirst({
    where: { id: templateId, legalEntityId: actor.membership.legalEntityId, businessUnitId: actor.membership.businessUnitId, isActive: true },
  });
  if (!template) throw new FinanceServiceError("TEMPLATE_NOT_FOUND", "账单模板不存在、已停用或不属于当前业务板块。", 404);
  await requireTemplateAction(actor, "finance.statement_template.read", template);
  const counterparty = await requireCounterparty(actor, counterpartyId);
  if (template.counterpartyId && template.counterpartyId !== counterparty.id) {
    throw new FinanceServiceError("TEMPLATE_COUNTERPARTY_MISMATCH", "该账单模板只允许用于指定结算对象。", 400);
  }
  const scope = importScope(actor, counterparty);
  if (template.departmentId && template.departmentId !== scope.departmentId) {
    throw new FinanceServiceError("TEMPLATE_SCOPE_MISMATCH", "该账单模板不属于当前结算对象的部门范围。", 400);
  }
  const previewPlan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.statement_import.preview" });
  if (!previewPlan.canAccessStatementImports || !previewPlan.allowsCreate(actorTarget(actor, scope.departmentId, scope.siteId))) {
    throw new FinanceServiceError("CREATE_SCOPE_FORBIDDEN", "当前岗位不能在此组织范围预检账单。", 403);
  }
  const configuration = normalizeTemplateConfiguration(template.configuration);
  let artifact;
  let preview;
  try {
    artifact = preparePrivateSpreadsheetArtifact(input.file.name, input.file.bytes);
    preview = await previewFinanceStatementWorkbook(input.file.bytes, configuration, statementNoPrefix);
  } catch (error) {
    if (error instanceof FinanceStatementWorkbookError) throw workbookError(error);
    if (error instanceof Error) {
      const messages: Record<string, string> = {
        LEGACY_XLS_CONVERSION_REQUIRED: "当前安全解析器不读取旧式 .xls/.xlt，请在 Excel 中另存为 .xlsx 后上传。",
        XLSX_REQUIRED: "请上传 .xlsx 或 .xltx 格式的账单。",
        FILE_SIGNATURE_MISMATCH: "上传文件签名不是可信的 XLSX 文件。",
        FILE_SIZE_LIMIT_EXCEEDED: "上传账单超过大小限制。",
        INVALID_FILE_NAME: "文件名不正确。",
      };
      if (messages[error.message]) throw new FinanceServiceError(error.message, messages[error.message], 400);
    }
    throw error;
  }
  const statementNos = preview.sheets.map((sheet) => sheet.statementNo);
  const [existingStatement, existingBatch] = await Promise.all([
    prisma.financeStatement.findFirst({
      where: { businessUnitId: actor.membership.businessUnitId, counterpartyId: counterparty.id, statementNo: { in: statementNos } },
      select: { id: true },
    }),
    prisma.financeStatementImportBatch.findFirst({
      where: {
        businessUnitId: actor.membership.businessUnitId,
        counterpartyId: counterparty.id,
        sha256: artifact.sha256,
        status: { in: [FinanceStatementImportBatchStatus.PREVIEWED, FinanceStatementImportBatchStatus.IMPORTING, FinanceStatementImportBatchStatus.IMPORTED] },
      },
      include: importBatchInclude,
    }),
  ]);
  if (existingStatement) {
    throw new FinanceServiceError("STATEMENT_NO_IN_USE", "该结算对象下已有相同结算单号，请更换前缀后再预检。", 409);
  }
  if (existingBatch) {
    if (!previewPlan.allows(batchTarget(existingBatch))) {
      throw new FinanceServiceError("DUPLICATE_IMPORT_EXISTS", "相同源文件已在当前结算对象下预检或导入。", 409);
    }
    if (!matchesExistingPreview(existingBatch, {
      templateId: template.id,
      templateVersion: template.version,
      statementNoPrefix,
      externalReference,
      periodStart,
      periodEnd,
      issuedAt,
    })) {
      throw new FinanceServiceError("DUPLICATE_IMPORT_CONFIGURATION_CONFLICT", "相同源文件已经按另一套模板或账单信息预检；请查看原批次，不能静默复用。", 409);
    }
    return { batch: existingBatch, idempotent: true };
  }

  await localDemoStorage.put({ storageKey: artifact.storageKey, bytes: input.file.bytes });
  try {
    const created = await prisma.$transaction(async (tx) => {
      const batch = await tx.financeStatementImportBatch.create({
        data: {
          legalEntityId: actor.membership.legalEntityId,
          businessUnitId: actor.membership.businessUnitId,
          departmentId: scope.departmentId,
          siteId: scope.siteId,
          templateId: template.id,
          templateVersion: template.version,
          templateSnapshot: {
            code: template.code,
            name: template.name,
            version: template.version,
            configuration,
          } as Prisma.InputJsonValue,
          counterpartyId: counterparty.id,
          statementNoPrefix,
          externalReference,
          periodStart,
          periodEnd,
          issuedAt,
          originalName: artifact.originalName,
          storageKey: artifact.storageKey,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.sizeBytes,
          sha256: artifact.sha256,
          totalRows: preview.totalRows,
          readyRows: preview.readyRows,
          warningRows: preview.warningRows,
          rejectedRows: preview.rejectedRows,
          previewedByMembershipId: actor.membership.id,
          sheets: {
            create: preview.sheets.map((sheet) => ({
              sheetKey: sheet.sheetKey,
              sheetName: sheet.sheetName,
              headerRowNumber: sheet.headerRowNumber,
              statementNo: sheet.statementNo,
              statementType: sheet.statementType,
              currency: sheet.currency,
              currencyScale: sheet.currencyScale,
              totalAmountCents: sheet.totalAmountCents,
              totalRows: sheet.totalRows,
              readyRows: sheet.readyRows,
              warningRows: sheet.warningRows,
              rejectedRows: sheet.rejectedRows,
              rows: {
                create: sheet.rows.map((row) => ({
                  rowNumber: row.rowNumber,
                  sourceRowHash: row.sourceRowHash,
                  status: row.status as FinanceStatementImportRowStatus,
                  issueCodes: row.issueCodes as unknown as Prisma.InputJsonValue,
                  message: row.message,
                  sourceReference: row.sourceReference,
                  trackingReference: row.trackingReference,
                  description: row.description,
                  currency: row.currency,
                  currencyScale: row.currencyScale,
                  amountCents: row.amountCents,
                  sourceSnapshot: row.sourceSnapshot as Prisma.InputJsonValue,
                })),
              },
            })),
          },
        },
        include: importBatchInclude,
      });
      await writeAuditLog({
        actorUserId: actor.userId,
        actorMembershipId: actor.membership.id,
        legalEntityId: batch.legalEntityId,
        businessUnitId: batch.businessUnitId,
        roleId: actor.membership.roleId,
        module: "finance.statement_import",
        action: "finance.statement_import.preview",
        targetType: "finance_statement_import_batch",
        targetId: batch.id,
        details: {
          template: { id: template.id, code: template.code, version: template.version },
          counterpartyId: counterparty.id,
          sourceFile: { originalName: artifact.originalName, sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
          summary: { total: preview.totalRows, ready: preview.readyRows, warning: preview.warningRows, rejected: preview.rejectedRows },
          sheets: preview.sheets.map((sheet) => ({ key: sheet.sheetKey, statementNo: sheet.statementNo, currency: sheet.currency, totalRows: sheet.totalRows, rejectedRows: sheet.rejectedRows })),
        },
      }, tx);
      return batch;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { batch: created, idempotent: false };
  } catch (error) {
    await localDemoStorage.delete(artifact.storageKey);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.financeStatementImportBatch.findFirst({
        where: {
          businessUnitId: actor.membership.businessUnitId,
          counterpartyId: counterparty.id,
          sha256: artifact.sha256,
          status: { in: [FinanceStatementImportBatchStatus.PREVIEWED, FinanceStatementImportBatchStatus.IMPORTING, FinanceStatementImportBatchStatus.IMPORTED] },
        },
        include: importBatchInclude,
      });
      if (duplicate && previewPlan.allows(batchTarget(duplicate))) {
        if (!matchesExistingPreview(duplicate, {
          templateId: template.id,
          templateVersion: template.version,
          statementNoPrefix,
          externalReference,
          periodStart,
          periodEnd,
          issuedAt,
        })) {
          throw new FinanceServiceError("DUPLICATE_IMPORT_CONFIGURATION_CONFLICT", "相同源文件已经按另一套模板或账单信息预检；请查看原批次，不能静默复用。", 409);
        }
        return { batch: duplicate, idempotent: true };
      }
      throw new FinanceServiceError("DUPLICATE_IMPORT_EXISTS", "相同源文件已在当前结算对象下预检或导入。", 409);
    }
    throw error;
  }
}

export async function findFinanceStatementImportBatch(actor: FinanceImportActor, importBatchId: string, actionKey = "finance.statement_import.read") {
  const batch = await prisma.financeStatementImportBatch.findFirst({
    where: {
      id: importBatchId,
      legalEntityId: actor.membership.legalEntityId,
      businessUnitId: actor.membership.businessUnitId,
    },
    include: importBatchInclude,
  });
  if (!batch) throw new FinanceServiceError("FINANCE_IMPORT_NOT_FOUND", "账单导入批次不存在或不属于当前业务板块。", 404);
  await requireBatchAction(actor, actionKey, batch);
  return batch;
}

export async function confirmFinanceStatementImport(actor: FinanceImportActor, importBatchId: string) {
  const batch = await findFinanceStatementImportBatch(actor, importBatchId, "finance.statement_import.confirm");
  if (batch.status === FinanceStatementImportBatchStatus.IMPORTED) return { batch, idempotent: true };
  if (batch.status !== FinanceStatementImportBatchStatus.PREVIEWED) {
    throw new FinanceServiceError("IMPORT_NOT_CONFIRMABLE", "该账单导入批次当前不能确认。", 409);
  }
  const statementCreatePlan = await createFinanceAccessPlan({ membership: actor.membership, actionKey: "finance.statement.create" });
  if (!statementCreatePlan.canAccessStatements || !statementCreatePlan.allowsCreate(actorTarget(actor, batch.departmentId, batch.siteId))) {
    throw new FinanceServiceError("CREATE_SCOPE_FORBIDDEN", "当前岗位没有在该账单范围创建草稿结算单的权限。", 403);
  }
  const sourceBytes = await localDemoStorage.get(batch.storageKey);
  if (!sourceBytes) {
    throw new FinanceServiceError("IMPORT_SOURCE_MISSING", "原始账单文件不存在，不能确认写入。", 409);
  }
  const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
  if (sourceHash !== batch.sha256) {
    throw new FinanceServiceError("IMPORT_SOURCE_CHANGED", "原始账单文件校验失败，请重新预检后再确认。", 409);
  }
  if (!batch.readyRows || batch.warningRows || batch.rejectedRows || batch.sheets.some((sheet) => sheet.createdStatementId)) {
    throw new FinanceServiceError("IMPORT_PREVIEW_NOT_CLEAN", "预检中仍有警告、错误或已生成结算单；不能确认导入。", 409);
  }

  try {
    const imported = await prisma.$transaction(async (tx) => {
      const claimed = await tx.financeStatementImportBatch.updateMany({
        where: { id: batch.id, status: FinanceStatementImportBatchStatus.PREVIEWED },
        data: { status: FinanceStatementImportBatchStatus.IMPORTING },
      });
      if (claimed.count !== 1) throw new FinanceServiceError("IMPORT_PREVIEW_STALE", "该预检已被其他人员处理，请刷新后重试。", 409);

      const current = await tx.financeStatementImportBatch.findUniqueOrThrow({ where: { id: batch.id }, include: importBatchInclude });
      if (current.warningRows || current.rejectedRows || !current.readyRows || current.sheets.some((sheet) => sheet.createdStatementId)) {
        throw new FinanceServiceError("IMPORT_PREVIEW_STALE", "预检结果已发生变化，请重新预检。", 409);
      }
      const createdStatementIds: string[] = [];
      for (const sheet of current.sheets) {
        const rows = sheet.rows.filter((row) => row.status === FinanceStatementImportRowStatus.READY);
        if (!rows.length || rows.length !== sheet.readyRows) {
          throw new FinanceServiceError("IMPORT_PREVIEW_STALE", "预检明细已发生变化，请重新预检。", 409);
        }
        const total = rows.reduce((sum, row) => sum + (row.amountCents ?? BigInt(0)), BigInt(0));
        if (total <= BigInt(0) || total !== sheet.totalAmountCents || rows.some((row) => row.amountCents === null || row.currency !== sheet.currency || row.currencyScale !== sheet.currencyScale)) {
          throw new FinanceServiceError("IMPORT_PREVIEW_STALE", "预检金额或币种已发生变化，请重新预检。", 409);
        }
        const conflict = await tx.financeStatement.findFirst({
          where: { businessUnitId: current.businessUnitId, counterpartyId: current.counterpartyId, statementNo: sheet.statementNo },
          select: { id: true },
        });
        if (conflict) throw new FinanceServiceError("STATEMENT_NO_IN_USE", "该结算对象下已有相同结算单号，不能确认导入。", 409);
        const statement = await tx.financeStatement.create({
          data: {
            legalEntityId: current.legalEntityId,
            businessUnitId: current.businessUnitId,
            departmentId: current.departmentId,
            siteId: current.siteId,
            counterpartyId: current.counterpartyId,
            statementNo: sheet.statementNo,
            type: sheet.statementType,
            currency: sheet.currency,
            currencyScale: sheet.currencyScale,
            totalAmountCents: total,
            periodStart: current.periodStart,
            periodEnd: current.periodEnd,
            issuedAt: current.issuedAt,
            externalReference: current.externalReference,
            note: `由账单预检批次 ${current.id} 确认导入；尚未自动对账或过账。`,
            createdByMembershipId: actor.membership.id,
          },
          select: { id: true },
        });
        await tx.financeStatementLine.createMany({
          data: rows.map((row, index) => ({
            statementId: statement.id,
            lineNo: index + 1,
            sourceReference: row.sourceReference,
            description: row.description,
            currency: sheet.currency,
            currencyScale: sheet.currencyScale,
            amountCents: row.amountCents!,
            sourceSnapshot: {
              importBatchId: current.id,
              importSheetId: sheet.id,
              importRowId: row.id,
              sourceRowHash: row.sourceRowHash,
              sourceReference: row.sourceReference,
              trackingReference: row.trackingReference,
            } as Prisma.InputJsonValue,
          })),
        });
        const updatedRows = await tx.financeStatementImportRow.updateMany({
          where: { importSheetId: sheet.id, status: FinanceStatementImportRowStatus.READY },
          data: { status: FinanceStatementImportRowStatus.IMPORTED, importedAt: new Date() },
        });
        if (updatedRows.count !== rows.length) throw new FinanceServiceError("IMPORT_PREVIEW_STALE", "预检行已发生变化，请重新预检。", 409);
        await tx.financeStatementImportSheet.update({
          where: { id: sheet.id },
          data: { createdStatementId: statement.id, importedRows: rows.length },
        });
        createdStatementIds.push(statement.id);
      }
      await tx.financeStatementImportBatch.update({
        where: { id: current.id },
        data: {
          status: FinanceStatementImportBatchStatus.IMPORTED,
          importedRows: current.readyRows,
          confirmedByMembershipId: actor.membership.id,
          confirmedAt: new Date(),
        },
      });
      await writeAuditLog({
        actorUserId: actor.userId,
        actorMembershipId: actor.membership.id,
        legalEntityId: current.legalEntityId,
        businessUnitId: current.businessUnitId,
        roleId: actor.membership.roleId,
        module: "finance.statement_import",
        action: "finance.statement_import.confirm",
        targetType: "finance_statement_import_batch",
        targetId: current.id,
        details: {
          sourceFile: { originalName: current.originalName, sha256: current.sha256, sizeBytes: current.sizeBytes },
          importedRows: current.readyRows,
          createdStatementIds,
          invariant: "creates_draft_statements_only_no_automatic_reconciliation_or_payment",
        },
      }, tx);
      return tx.financeStatementImportBatch.findUniqueOrThrow({ where: { id: current.id }, include: importBatchInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { batch: imported, idempotent: false };
  } catch (error) {
    if (error instanceof FinanceServiceError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2025"].includes(error.code)) {
      throw new FinanceServiceError("IMPORT_PREVIEW_STALE", "预检或结算单状态已变化，本次确认未写入，请刷新后重试。", 409);
    }
    throw error;
  }
}

export { financeStatementImportBatchDto, financeStatementTemplateDto };
