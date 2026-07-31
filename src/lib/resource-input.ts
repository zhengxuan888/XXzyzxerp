import { z } from "zod";

const code = z.string().trim().min(2).max(48).regex(/^[A-Za-z0-9_-]+$/, "编码只能包含字母、数字、下划线或连字符。");
const text = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalUuid = z.string().uuid().optional().nullable();
const nonNegativeCents = z.string().trim().regex(/^\d{1,18}$/, "金额必须使用最小货币单位的非负整数。").optional().nullable();

export const softwareProfileInputSchema = z.object({
  platform: text(120),
  accountIdentifier: text(180),
  licenseType: text(80),
  seatsTotal: z.coerce.number().int().min(0).max(1000000).optional().nullable(),
  seatsUsed: z.coerce.number().int().min(0).max(1000000).optional().nullable(),
  autoRenewal: z.boolean().optional(),
  renewalCostCents: nonNegativeCents,
  renewalCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional().nullable(),
  renewalCycle: text(80),
}).strict();

export const resourceAssetInputSchema = z.object({
  resourceNo: text(80),
  name: z.string().trim().min(1).max(160),
  categoryId: z.string().uuid(),
  statusId: z.string().uuid(),
  departmentId: optionalUuid,
  siteId: optionalUuid,
  assignedMembershipId: optionalUuid,
  brandModel: text(160),
  serialNumber: text(160),
  ownership: text(100),
  location: text(160),
  quantity: z.coerce.number().int().min(1).max(1000000).default(1),
  availableQuantity: z.coerce.number().int().min(0).max(1000000).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000000).default(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default("CNY"),
  valueCents: nonNegativeCents,
  purchasedAt: text(40),
  expiresAt: text(40),
  note: text(2000),
  software: softwareProfileInputSchema.optional().nullable(),
}).strict();

export const resourceAssetPatchSchema = resourceAssetInputSchema.partial().strict();

export const resourceLifecycleInputSchema = z.object({
  lifecycleActionId: z.string().uuid(),
  nextAssigneeMembershipId: optionalUuid,
  note: text(2000),
}).strict();

export const resourceConfigInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("category"),
    code,
    name: z.string().trim().min(1).max(80),
    description: text(300),
    isSoftware: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(-100000).max(100000).default(0),
  }).strict(),
  z.object({
    kind: z.literal("status"),
    code,
    name: z.string().trim().min(1).max(80),
    color: text(32),
    isTerminal: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(-100000).max(100000).default(0),
  }).strict(),
  z.object({
    kind: z.literal("lifecycleAction"),
    code,
    name: z.string().trim().min(1).max(80),
    fromStatusId: optionalUuid,
    toStatusId: optionalUuid,
    availableQuantityDelta: z.coerce.number().int().min(-1000000).max(1000000).default(0),
    archiveAsset: z.boolean().default(false),
    requiresAssignee: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(-100000).max(100000).default(0),
  }).strict(),
]);

// Configuration codes are stable references and are intentionally immutable
// after creation. Administrators can rename, reorder or disable a record
// without breaking existing assets, lifecycle history or audit records.
export const resourceConfigPatchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("category"),
    name: z.string().trim().min(1).max(80).optional(),
    description: text(300),
    isSoftware: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(-100000).max(100000).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
  z.object({
    kind: z.literal("status"),
    name: z.string().trim().min(1).max(80).optional(),
    color: text(32),
    isTerminal: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(-100000).max(100000).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
  z.object({
    kind: z.literal("lifecycleAction"),
    name: z.string().trim().min(1).max(80).optional(),
    fromStatusId: optionalUuid,
    toStatusId: optionalUuid,
    availableQuantityDelta: z.coerce.number().int().min(-1000000).max(1000000).optional(),
    archiveAsset: z.boolean().optional(),
    requiresAssignee: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(-100000).max(100000).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
]);

export type ResourceAssetInput = z.infer<typeof resourceAssetInputSchema>;
export type ResourceLifecycleInput = z.infer<typeof resourceLifecycleInputSchema>;

export function parseDateOrNull(value: string | null | undefined, fieldName: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${fieldName}日期格式不正确。`);
  return parsed;
}

export function toBigIntOrNull(value: string | null | undefined) {
  return value ? BigInt(value) : null;
}

export function safeResourceAuditDetails(input: ResourceAssetInput) {
  // Do not add software.accountIdentifier here. Audit records are intentionally
  // free of account identifiers as well as passwords, tokens and licence keys.
  return {
    resourceNo: input.resourceNo ?? null,
    name: input.name,
    categoryId: input.categoryId,
    statusId: input.statusId,
    departmentId: input.departmentId ?? null,
    siteId: input.siteId ?? null,
    assignedMembershipId: input.assignedMembershipId ?? null,
    quantity: input.quantity,
    availableQuantity: input.availableQuantity ?? input.quantity,
    lowStockThreshold: input.lowStockThreshold,
    currency: input.currency,
    hasSoftwareProfile: Boolean(input.software),
  };
}

export function resolveResourceTransition({
  currentStatusId,
  action,
  availableQuantity,
  quantity,
}: {
  currentStatusId: string;
  action: { fromStatusId: string | null; toStatusId: string | null; availableQuantityDelta: number; archiveAsset: boolean };
  availableQuantity: number;
  quantity: number;
}) {
  if (action.fromStatusId && action.fromStatusId !== currentStatusId) {
    throw new Error("该流转动作不适用于资源当前状态。");
  }
  const nextAvailableQuantity = availableQuantity + action.availableQuantityDelta;
  if (nextAvailableQuantity < 0 || nextAvailableQuantity > quantity) {
    throw new Error("流转后的可用数量无效，不能造成负库存或超过总数量。");
  }
  return {
    statusId: action.toStatusId ?? currentStatusId,
    availableQuantity: nextAvailableQuantity,
    archiveAsset: action.archiveAsset,
  };
}
