export const marketingWorkbenchCardKinds = ["METRIC", "QUEUE", "QUICK_ACTION"] as const;
export type MarketingWorkbenchCardKind = (typeof marketingWorkbenchCardKinds)[number];

export const marketingWorkbenchZones = ["FOCUS", "OVERVIEW", "QUICK"] as const;
export type MarketingWorkbenchZone = (typeof marketingWorkbenchZones)[number];

// Queue keys are implementation-stable capabilities. They deliberately do
// not contain a department, role, channel, or business-unit name. The layout,
// label, audience and whether each queue is shown are database configuration.
export const marketingWorkbenchQueueKeys = [
  "MY_DRAFT_REPORTS",
  "RETURNED_REPORTS",
  "PENDING_REVIEW",
  "MY_CREATIVES",
] as const;
export type MarketingWorkbenchQueueKey = (typeof marketingWorkbenchQueueKeys)[number];

export type MarketingWorkbenchCardAudience = {
  roleIds: string[];
  departmentIds: string[];
  membershipIds: string[];
};

export type MarketingWorkbenchCard = {
  key: string;
  kind: MarketingWorkbenchCardKind;
  label: string;
  description: string;
  isVisible: boolean;
  zone: MarketingWorkbenchZone;
  sortOrder: number;
  audience: MarketingWorkbenchCardAudience;
  metricCode: string | null;
  queueKey: MarketingWorkbenchQueueKey | null;
  actionKey: string | null;
  href: string | null;
};

export type MarketingWorkbenchConfig = {
  cards: MarketingWorkbenchCard[];
};

const metricCodePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const actionKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const cardKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

const defaultCards: MarketingWorkbenchCard[] = [
  {
    key: "report-entry",
    kind: "QUICK_ACTION",
    label: "填写日报",
    description: "记录今天的原始投放数据，系统自动计算比率指标。",
    isVisible: true,
    zone: "FOCUS",
    sortOrder: 10,
    audience: { roleIds: [], departmentIds: [], membershipIds: [] },
    metricCode: null,
    queueKey: null,
    actionKey: "marketing.report.create",
    href: "/admin/marketing/reports?create=1",
  },
  {
    key: "my-draft-reports",
    kind: "QUEUE",
    label: "待完成日报",
    description: "继续填写自己的草稿日报。",
    isVisible: true,
    zone: "FOCUS",
    sortOrder: 20,
    audience: { roleIds: [], departmentIds: [], membershipIds: [] },
    metricCode: null,
    queueKey: "MY_DRAFT_REPORTS",
    actionKey: "marketing.report.read",
    href: "/admin/marketing/reports?status=DRAFT",
  },
  {
    key: "returned-reports",
    kind: "QUEUE",
    label: "退回待修改",
    description: "处理被退回的日报并重新提交。",
    isVisible: true,
    zone: "FOCUS",
    sortOrder: 30,
    audience: { roleIds: [], departmentIds: [], membershipIds: [] },
    metricCode: null,
    queueKey: "RETURNED_REPORTS",
    actionKey: "marketing.report.read",
    href: "/admin/marketing/reports?status=RETURNED",
  },
  {
    key: "kpi-overview",
    kind: "QUICK_ACTION",
    label: "团队与 KPI",
    description: "查看当前授权范围内的目标、实际与达成情况。",
    isVisible: true,
    zone: "QUICK",
    sortOrder: 40,
    audience: { roleIds: [], departmentIds: [], membershipIds: [] },
    metricCode: null,
    queueKey: null,
    actionKey: "marketing.kpi.read",
    href: "/admin/marketing/kpis",
  },
  {
    key: "creative-library",
    kind: "QUICK_ACTION",
    label: "素材中心",
    description: "查找、上传、标注并管理投放素材。",
    isVisible: true,
    zone: "QUICK",
    sortOrder: 50,
    audience: { roleIds: [], departmentIds: [], membershipIds: [] },
    metricCode: null,
    queueKey: null,
    actionKey: "marketing.creative.read",
    href: "/admin/marketing/creatives",
  },
];

export const defaultMarketingWorkbenchConfig: MarketingWorkbenchConfig = { cards: defaultCards };

function listOfIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean))].slice(0, 100);
}

function text(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function numberInRange(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : fallback;
}

function safeMetricCode(value: unknown) {
  return typeof value === "string" && metricCodePattern.test(value.trim()) ? value.trim() : null;
}

function safeActionKey(value: unknown) {
  return typeof value === "string" && actionKeyPattern.test(value.trim()) ? value.trim() : null;
}

function safeAdminHref(value: unknown) {
  if (typeof value !== "string") return null;
  const href = value.trim();
  return /^\/admin(?:\/[A-Za-z0-9/_-]*)?(?:\?[A-Za-z0-9=&_.%/-]*)?$/.test(href) ? href.slice(0, 320) : null;
}

function fallbackFor(kind: MarketingWorkbenchCardKind, key: string) {
  const known = defaultCards.find((card) => card.key === key && card.kind === kind);
  return known ?? {
    key,
    kind,
    label: kind === "METRIC" ? "投放指标" : kind === "QUEUE" ? "待办队列" : "快捷入口",
    description: "由拥有配置权限的人员维护。",
    isVisible: true,
    zone: kind === "QUICK_ACTION" ? "QUICK" : "OVERVIEW" as MarketingWorkbenchZone,
    sortOrder: 100,
    audience: { roleIds: [], departmentIds: [], membershipIds: [] },
    metricCode: null,
    queueKey: null,
    actionKey: null,
    href: null,
  } satisfies MarketingWorkbenchCard;
}

/**
 * Accepts only a small, auditable card contract. The card layout is stored in
 * the database, while raw metric definitions and permissions are rechecked by
 * the server on every request.
 */
export function parseMarketingWorkbenchConfig(raw: { cards?: unknown } | null | undefined): MarketingWorkbenchConfig {
  const candidateCards = Array.isArray(raw?.cards) ? raw.cards : defaultMarketingWorkbenchConfig.cards;
  const cards = new Map<string, MarketingWorkbenchCard>();

  for (const entry of candidateCards) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    const kind = marketingWorkbenchCardKinds.includes(value.kind as MarketingWorkbenchCardKind)
      ? value.kind as MarketingWorkbenchCardKind
      : null;
    const key = typeof value.key === "string" && cardKeyPattern.test(value.key.trim()) ? value.key.trim() : null;
    if (!kind || !key || cards.has(key)) continue;
    const fallback = fallbackFor(kind, key);
    const audienceSource = value.audience && typeof value.audience === "object"
      ? value.audience as Record<string, unknown>
      : {};
    const metricCode = safeMetricCode(value.metricCode);
    const queueKey = marketingWorkbenchQueueKeys.includes(value.queueKey as MarketingWorkbenchQueueKey)
      ? value.queueKey as MarketingWorkbenchQueueKey
      : null;
    const actionKey = safeActionKey(value.actionKey);
    const href = safeAdminHref(value.href);

    // Each kind has one required, revalidated reference. Invalid cards are
    // ignored rather than silently becoming broader than intended.
    if ((kind === "METRIC" && !metricCode) || (kind === "QUEUE" && !queueKey) || (kind === "QUICK_ACTION" && (!actionKey || !href))) continue;
    cards.set(key, {
      key,
      kind,
      label: text(value.label, fallback.label, 60),
      description: text(value.description, fallback.description, 180),
      isVisible: value.isVisible !== false,
      zone: marketingWorkbenchZones.includes(value.zone as MarketingWorkbenchZone)
        ? value.zone as MarketingWorkbenchZone
        : fallback.zone,
      sortOrder: numberInRange(value.sortOrder, fallback.sortOrder),
      audience: {
        roleIds: listOfIds(audienceSource.roleIds),
        departmentIds: listOfIds(audienceSource.departmentIds),
        membershipIds: listOfIds(audienceSource.membershipIds),
      },
      metricCode: kind === "METRIC" ? metricCode : null,
      queueKey: kind === "QUEUE" ? queueKey : null,
      actionKey,
      href,
    });
  }

  return {
    cards: [...cards.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)),
  };
}

export function marketingWorkbenchCardAppliesToMembership(
  card: MarketingWorkbenchCard,
  membership: { id: string; roleId: string; departmentId: string | null },
) {
  const audience = card.audience;
  if (audience.roleIds.length > 0 && !audience.roleIds.includes(membership.roleId)) return false;
  if (audience.departmentIds.length > 0 && (!membership.departmentId || !audience.departmentIds.includes(membership.departmentId))) return false;
  if (audience.membershipIds.length > 0 && !audience.membershipIds.includes(membership.id)) return false;
  return true;
}
