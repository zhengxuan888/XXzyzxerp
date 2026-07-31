export const dashboardMetricKeys = [
  "order_drafts",
  "order_review",
  "waiting_shipment",
  "in_transit",
  "high_priority",
  "high_priority_overdue",
  "needs_attention",
] as const;

export type DashboardMetricKey = (typeof dashboardMetricKeys)[number];
export type DashboardCardZone = "CORE" | "OVERVIEW";

export type DashboardMetricDefinition = {
  key: DashboardMetricKey;
  label: string;
  description: string;
  href: string;
  requiredActionKey: string;
  priorityWhenPositive?: boolean;
};

export const dashboardMetricDefinitions: DashboardMetricDefinition[] = [
  { key: "order_drafts", label: "录入订单", description: "查看自己可继续录入或编辑的订单草稿", href: "/admin/orders", requiredActionKey: "order.create" },
  { key: "order_review", label: "订单核单", description: "处理待审核订单的基础信息与凭证", href: "/admin/order-review", requiredActionKey: "order.review", priorityWhenPositive: true },
  { key: "waiting_shipment", label: "待发货处理", description: "处理已核单订单的物流单号与出货凭证", href: "/admin/shipping", requiredActionKey: "order.ship", priorityWhenPositive: true },
  { key: "in_transit", label: "物流追踪 / 跟单售后", description: "查看运输中订单的最新轨迹和客户联系信息", href: "/admin/shipments?queue=in_transit", requiredActionKey: "shipment.read" },
  { key: "high_priority", label: "高优先级待办", description: "优先处理异常或需要立即联系客户的物流轨迹", href: "/admin/shipments?queue=high", requiredActionKey: "shipment.track.update", priorityWhenPositive: true },
  { key: "high_priority_overdue", label: "高优先级超期待办", description: "高优先级且超过跟进时间的订单，需要立即处理", href: "/admin/shipments?queue=critical&overdue=1", requiredActionKey: "shipment.track.update", priorityWhenPositive: true },
  { key: "needs_attention", label: "需要关注", description: "查看未处理的物流轨迹与售后待办", href: "/admin/shipments?queue=unhandled", requiredActionKey: "shipment.track.update", priorityWhenPositive: true },
];

export type DashboardCardAudience = {
  roleIds: string[];
  departmentIds: string[];
  membershipIds: string[];
};

export type DashboardWorkbenchCard = {
  key: DashboardMetricKey;
  label: string;
  description: string;
  isVisible: boolean;
  zone: DashboardCardZone;
  sortOrder: number;
  audience: DashboardCardAudience;
};

export type DashboardWorkbenchConfig = {
  cards: DashboardWorkbenchCard[];
};

const definitionByKey = new Map(dashboardMetricDefinitions.map((definition) => [definition.key, definition]));

function defaultCard(key: DashboardMetricKey, sortOrder: number): DashboardWorkbenchCard {
  const definition = definitionByKey.get(key)!;
  return {
    key,
    label: definition.label,
    description: definition.description,
    isVisible: true,
    zone: "CORE",
    sortOrder,
    audience: { roleIds: [], departmentIds: [], membershipIds: [] },
  };
}

export const defaultDashboardWorkbenchConfig: DashboardWorkbenchConfig = {
  cards: dashboardMetricKeys.map((key, index) => defaultCard(key, (index + 1) * 10)),
};

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

function int(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : fallback;
}

/**
 * Parses only supported metric keys and safe layout/audience values. Metric
 * definitions live in code because their database query must be audited; the
 * enabled card list and all placement/audience decisions live in the DB.
 */
export function parseDashboardWorkbenchConfig(raw: { cards?: unknown } | null | undefined): DashboardWorkbenchConfig {
  const sourceCards = Array.isArray(raw?.cards) ? raw.cards : defaultDashboardWorkbenchConfig.cards;
  const configured = new Map<DashboardMetricKey, DashboardWorkbenchCard>();

  for (const entry of sourceCards) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    if (!dashboardMetricKeys.includes(value.key as DashboardMetricKey)) continue;
    const key = value.key as DashboardMetricKey;
    if (configured.has(key)) continue;
    const fallback = defaultDashboardWorkbenchConfig.cards.find((card) => card.key === key)!;
    const audienceSource = value.audience && typeof value.audience === "object"
      ? value.audience as Record<string, unknown>
      : {};
    configured.set(key, {
      key,
      label: text(value.label, fallback.label, 60),
      description: text(value.description, fallback.description, 180),
      isVisible: value.isVisible !== false,
      zone: value.zone === "OVERVIEW" ? "OVERVIEW" : "CORE",
      sortOrder: int(value.sortOrder, fallback.sortOrder),
      audience: {
        roleIds: listOfIds(audienceSource.roleIds),
        departmentIds: listOfIds(audienceSource.departmentIds),
        membershipIds: listOfIds(audienceSource.membershipIds),
      },
    });
  }

  for (const fallback of defaultDashboardWorkbenchConfig.cards) {
    if (!configured.has(fallback.key)) configured.set(fallback.key, fallback);
  }
  return { cards: [...configured.values()].sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key)) };
}

export function getDashboardMetricDefinition(key: DashboardMetricKey) {
  return definitionByKey.get(key) ?? null;
}

export function dashboardCardAppliesToMembership(card: DashboardWorkbenchCard, membership: { id: string; roleId: string; departmentId: string | null }) {
  const audience = card.audience;
  if (audience.roleIds.length > 0 && !audience.roleIds.includes(membership.roleId)) return false;
  if (audience.departmentIds.length > 0 && (!membership.departmentId || !audience.departmentIds.includes(membership.departmentId))) return false;
  if (audience.membershipIds.length > 0 && !audience.membershipIds.includes(membership.id)) return false;
  return true;
}
