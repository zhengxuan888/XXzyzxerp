import { NextRequest } from "next/server";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok } from "@/lib/api-response";
import { createMarketingCreativeAccessPlan } from "@/lib/marketing-access";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  statusId: z.string().uuid().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
  marketCode: z.string().trim().max(20).nullable().optional(),
  languageCode: z.string().trim().max(20).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).max(30).optional(),
  archive: z.boolean().optional(),
  retiredReason: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const { id } = await props.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "素材修改内容不正确。", 400, parsed.error.flatten());
  const input = parsed.data;
  const creative = await prisma.marketingCreative.findFirst({
    where: { id, businessUnitId: auth.membership.businessUnitId },
    select: { id: true, businessUnitId: true, departmentId: true, siteId: true, ownerMembershipId: true, isArchived: true, statusId: true },
  });
  if (!creative) return fail("CREATIVE_NOT_FOUND", "素材不存在。", 404);
  const updateAccess = await createMarketingCreativeAccessPlan({ membership: auth.membership, actionKey: "marketing.creative.update" });
  if (!updateAccess.allowed || !updateAccess.allows(creative)) return fail("FORBIDDEN", "没有编辑该素材的权限。", 403);
  if (input.archive !== undefined && input.archive !== creative.isArchived) {
    const archiveAccess = await createMarketingCreativeAccessPlan({ membership: auth.membership, actionKey: "marketing.creative.archive" });
    if (!archiveAccess.allowed || !archiveAccess.allows(creative)) return fail("FORBIDDEN", "没有归档该素材的权限。", 403);
    if (input.archive && !input.retiredReason) return fail("RETIRED_REASON_REQUIRED", "归档素材时必须填写原因。", 400);
  }
  const businessUnitId = auth.membership.businessUnitId;
  const [status, source, product, tags] = await Promise.all([
    input.statusId ? prisma.marketingCreativeStatus.findFirst({ where: { id: input.statusId, businessUnitId, isActive: true } }) : null,
    input.sourceId ? prisma.marketingSource.findFirst({ where: { id: input.sourceId, businessUnitId, isActive: true } }) : null,
    input.productId ? prisma.product.findFirst({ where: { id: input.productId, businessUnitId, isActive: true }, select: { id: true } }) : null,
    input.tagIds ? prisma.marketingTag.findMany({ where: { id: { in: [...new Set(input.tagIds)] }, businessUnitId, isActive: true }, select: { id: true } }) : [],
  ]);
  if (input.statusId && !status) return fail("STATUS_NOT_FOUND", "素材状态不存在或未启用。", 400);
  if (input.sourceId && !source) return fail("SOURCE_NOT_FOUND", "投放数据源不存在或未启用。", 400);
  if (input.productId && !product) return fail("PRODUCT_NOT_FOUND", "商品不属于当前业务板块。", 400);
  if (input.tagIds && tags.length !== new Set(input.tagIds).size) return fail("TAG_NOT_FOUND", "存在无效的素材标签。", 400);
  if (source && ((source.departmentId && source.departmentId !== creative.departmentId) || (source.siteId && source.siteId !== creative.siteId))) {
    return fail("SOURCE_OUT_OF_SCOPE", "该投放数据源不属于素材所在的组织范围。", 403);
  }
  const updated = await prisma.$transaction(async (tx) => tx.marketingCreative.update({
    where: { id: creative.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.statusId !== undefined ? { statusId: status!.id } : {}),
      ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
      ...(input.productId !== undefined ? { productId: input.productId } : {}),
      ...(input.marketCode !== undefined ? { marketCode: input.marketCode } : {}),
      ...(input.languageCode !== undefined ? { languageCode: input.languageCode } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.archive !== undefined ? { isArchived: input.archive, retiredReason: input.archive ? input.retiredReason ?? null : null } : {}),
      ...(input.tagIds !== undefined ? { tags: { deleteMany: {}, create: tags.map((tag) => ({ tagId: tag.id })) } } : {}),
    },
    select: { id: true, name: true, statusId: true, isArchived: true, retiredReason: true, updatedAt: true },
  }));
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "marketing.creative",
    action: input.archive !== undefined && input.archive !== creative.isArchived ? "marketing.creative.archive" : "marketing.creative.update",
    targetType: "marketing_creative",
    targetId: creative.id,
    businessUnitId,
    roleId: auth.membership.roleId,
    details: { changed: Object.keys(input), archived: updated.isArchived, retiredReason: updated.retiredReason },
  });
  return ok(updated);
}
