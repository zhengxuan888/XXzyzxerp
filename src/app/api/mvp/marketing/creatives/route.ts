import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit";
import { requireAuthContext } from "@/lib/api-auth";
import { fail, ok, paginated, parsePagination } from "@/lib/api-response";
import { createMarketingCreativeAccessPlan } from "@/lib/marketing-access";
import { checkPermission } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  code: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  name: z.string().trim().min(1).max(160),
  statusId: z.string().uuid(),
  sourceId: z.string().uuid().nullish(),
  productId: z.string().uuid().nullish(),
  marketCode: z.string().trim().max(20).nullish(),
  languageCode: z.string().trim().max(20).nullish(),
  description: z.string().trim().max(4000).nullish(),
  tagIds: z.array(z.string().uuid()).max(30).default([]),
});

async function canCreate(auth: NonNullable<Awaited<ReturnType<typeof requireAuthContext>>>) {
  return checkPermission({
    userId: auth.userId,
    membershipId: auth.membership.id,
    actionKey: "marketing.creative.create",
    targetBusinessUnitId: auth.membership.businessUnitId,
    targetDepartmentId: auth.membership.departmentId,
    targetSiteId: auth.membership.siteId,
    targetMembershipId: auth.membership.id,
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const [access, updateAccess, archiveAccess] = await Promise.all([
    createMarketingCreativeAccessPlan({ membership: auth.membership }),
    createMarketingCreativeAccessPlan({ membership: auth.membership, actionKey: "marketing.creative.update" }),
    createMarketingCreativeAccessPlan({ membership: auth.membership, actionKey: "marketing.creative.archive" }),
  ]);
  if (!access.allowed) return fail("FORBIDDEN", "没有查看投放素材的权限。", 403);
  const pagination = parsePagination(request, 100);
  const statusId = request.nextUrl.searchParams.get("statusId");
  const sourceId = request.nextUrl.searchParams.get("sourceId");
  const tagId = request.nextUrl.searchParams.get("tagId");
  const archived = request.nextUrl.searchParams.get("archived");
  const search = request.nextUrl.searchParams.get("search")?.trim();
  if (archived && archived !== "true" && archived !== "false") return fail("INVALID_ARCHIVED_FILTER", "归档筛选不正确。", 400);
  const where = {
    AND: [
      access.where,
      { businessUnitId: auth.membership.businessUnitId },
      statusId ? { statusId } : {},
      sourceId ? { sourceId } : {},
      tagId ? { tags: { some: { tagId } } } : {},
      archived === "true" ? { isArchived: true } : archived === "false" ? { isArchived: false } : {},
      search ? { OR: [{ code: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }, { description: { contains: search, mode: "insensitive" as const } }] } : {},
    ],
  };
  const [total, items] = await Promise.all([
    prisma.marketingCreative.count({ where }),
    prisma.marketingCreative.findMany({
      where,
      orderBy: [{ isArchived: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
      include: {
        status: { select: { id: true, code: true, name: true, color: true, isTerminal: true } },
        source: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, code: true, name: true } },
        ownerMembership: { include: { user: { select: { fullName: true, username: true } } } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
        assets: { orderBy: [{ purpose: "asc" }, { sortOrder: "asc" }], include: { attachment: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, status: true } } } },
      },
    }),
  ]);
  const safeItems = await Promise.all(items.map(async (item) => {
    const attachmentRead = await checkPermission({
      userId: auth.userId,
      membershipId: auth.membership.id,
      actionKey: "attachment.read",
      targetBusinessUnitId: item.businessUnitId,
      targetDepartmentId: item.departmentId,
      targetSiteId: item.siteId,
      targetMembershipId: item.ownerMembershipId,
    });
    return { item, attachmentRead: attachmentRead.allowed };
  }));
  return paginated(safeItems.map(({ item, attachmentRead }) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    marketCode: item.marketCode,
    languageCode: item.languageCode,
    description: item.description,
    isArchived: item.isArchived,
    retiredReason: item.retiredReason,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status: item.status,
    source: item.source,
    product: item.product,
    owner: { membershipId: item.ownerMembershipId, name: item.ownerMembership.user.fullName, username: item.ownerMembership.user.username },
    tags: item.tags.map((row) => row.tag),
    canUpdate: updateAccess.allowed && updateAccess.allows(item),
    canArchive: archiveAccess.allowed && archiveAccess.allows(item),
    // A material record can be visible while the binary file itself is not.
    // Do not leak a deleted file's name/type/size into the list response.
    assets: attachmentRead
      ? item.assets.filter((asset) => asset.attachment.status === "ACTIVE").map((asset) => ({ id: asset.id, purpose: asset.purpose, sortOrder: asset.sortOrder, attachment: asset.attachment }))
      : [],
  })), total, pagination);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthContext(request);
  if (!auth) return fail("UNAUTHENTICATED", "请先登录。", 401);
  const permission = await canCreate(auth);
  if (!permission.allowed) return fail("FORBIDDEN", "没有创建投放素材的权限。", 403, { reasons: permission.reasons });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "素材内容不正确。", 400, parsed.error.flatten());
  const input = parsed.data;
  const businessUnitId = auth.membership.businessUnitId;
  const [status, source, product, tags] = await Promise.all([
    prisma.marketingCreativeStatus.findFirst({ where: { id: input.statusId, businessUnitId, isActive: true } }),
    input.sourceId ? prisma.marketingSource.findFirst({ where: { id: input.sourceId, businessUnitId, isActive: true } }) : null,
    input.productId ? prisma.product.findFirst({ where: { id: input.productId, businessUnitId, isActive: true }, select: { id: true } }) : null,
    input.tagIds.length ? prisma.marketingTag.findMany({ where: { id: { in: [...new Set(input.tagIds)] }, businessUnitId, isActive: true }, select: { id: true } }) : [],
  ]);
  if (!status) return fail("STATUS_NOT_FOUND", "素材状态不存在或未启用。", 400);
  if (input.sourceId && !source) return fail("SOURCE_NOT_FOUND", "投放数据源不存在或未启用。", 400);
  if (input.productId && !product) return fail("PRODUCT_NOT_FOUND", "商品不属于当前业务板块。", 400);
  if (tags.length !== new Set(input.tagIds).size) return fail("TAG_NOT_FOUND", "存在无效的素材标签。", 400);
  if (source && ((source.departmentId && source.departmentId !== auth.membership.departmentId) || (source.siteId && source.siteId !== auth.membership.siteId))) {
    return fail("SOURCE_OUT_OF_SCOPE", "该投放数据源不在当前岗位范围内。", 403);
  }
  let creative: { id: string; code: string; name: string };
  try {
    creative = await prisma.marketingCreative.create({
      data: {
        legalEntityId: auth.membership.legalEntityId,
        businessUnitId,
        departmentId: auth.membership.departmentId,
        siteId: auth.membership.siteId,
        sourceId: input.sourceId ?? null,
        productId: input.productId ?? null,
        statusId: status.id,
        ownerMembershipId: auth.membership.id,
        createdByUserId: auth.userId,
        code: input.code,
        name: input.name,
        marketCode: input.marketCode ?? null,
        languageCode: input.languageCode ?? null,
        description: input.description ?? null,
        tags: tags.length ? { create: tags.map((tag) => ({ tagId: tag.id })) } : undefined,
      },
      select: { id: true, code: true, name: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("CREATIVE_CODE_EXISTS", "当前业务板块已存在相同素材编码，请更换编码后重试。", 409);
    }
    throw error;
  }
  await writeAuditLog({
    actorUserId: auth.userId,
    actorMembershipId: auth.membership.id,
    module: "marketing.creative",
    action: "marketing.creative.create",
    targetType: "marketing_creative",
    targetId: creative.id,
    businessUnitId,
    roleId: auth.membership.roleId,
    details: { code: creative.code, sourceId: input.sourceId ?? null, statusId: status.id, tagCount: tags.length },
  });
  return ok(creative, { status: 201 });
}
