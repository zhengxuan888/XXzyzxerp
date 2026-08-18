import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../prisma/migrations/20260818160000_hongya_forward_declared_amount/migration.sql",
  import.meta.url,
), "utf8");
const layoutMigration = readFileSync(new URL(
  "../../../prisma/migrations/20260813100000_hongya_forward_export_layouts/migration.sql",
  import.meta.url,
), "utf8");

function declaredColumns(name: "west" | "east") {
  const match = migration.match(new RegExp(`${name}_declared_amount_columns JSONB := \\$json\\$([\\s\\S]*?)\\$json\\$::jsonb`));
  if (!match?.[1]) throw new Error(`${name} declared-amount layout not found`);
  return JSON.parse(match[1]) as Array<{ field: string; header: string }>;
}

describe("Hongya forwarding declaration migration", () => {
  it("accepts the master-first West customs fingerprint before rebuilding the complete layout", () => {
    const match = layoutMigration.match(/west_master_customs_columns JSONB := \$json\$([\s\S]*?)\$json\$::jsonb/);
    if (!match?.[1]) throw new Error("master-first West customs layout not found");
    const columns = JSON.parse(match[1]) as Array<{ field: string; header: string }>;
    expect([columns[3], columns[4], columns[6], columns[7]]).toEqual([
      { field: "constant:Phone", header: "海关报关品名1" },
      { field: "constant:手机", header: "中文品名1" },
      { field: "declarationAmount", header: "申报金额" },
      { field: "declarationCurrency", header: "海关申报币种" },
    ]);
    expect(layoutMigration).toContain(
      `template_record."configuration"->'columns' IS DISTINCT FROM west_master_customs_columns`,
    );
  });

  it("upgrades only forwarding template codes", () => {
    expect(migration).toContain("HONGYA_IBERIA_FORWARD");
    expect(migration).toContain("HONGYA_EAST_EU_FORWARD");
    expect(migration).toContain("HONGYA_EAST_FORWARD");
    expect(migration).toContain("（鸿亚）东欧转寄");
    expect(migration).not.toContain("HONGYA_IBERIA_DROPSHIP");
    expect(migration).not.toContain("HONGYA_EAST_EU_DROPSHIP");
    expect(migration).not.toContain("FAN_RO_WMS");
  });

  it("pins the approved West forwarding fields at D/E/G/H", () => {
    const columns = declaredColumns("west");
    expect([columns[3], columns[4], columns[6], columns[7]]).toEqual([
      { field: "constant:Phone", header: "海关报关品名1" },
      { field: "constant:手机", header: "中文品名1" },
      { field: "declarationAmount", header: "申报金额" },
      { field: "constant:EUR", header: "海关申报币种" },
    ]);
  });

  it("pins the approved East-Europe forwarding fields at R/S/U/V", () => {
    const columns = declaredColumns("east");
    expect([columns[17], columns[18], columns[20], columns[21]]).toEqual([
      { field: "constant:Phone", header: "海关报关品名1" },
      { field: "constant:手机", header: "中文品名1" },
      { field: "declarationAmount", header: "申报价值1" },
      { field: "constant:EUR", header: "申报币种1" },
    ]);
  });
});
