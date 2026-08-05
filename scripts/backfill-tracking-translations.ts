import { prisma } from "../src/lib/prisma";
import { translateAndCacheTrackingText } from "../src/lib/tracking-translation-service";

async function main() {
  const rows = await prisma.shipmentEvent.findMany({
    where: { memo: { not: null } },
    select: { memo: true, shipment: { select: { businessUnitId: true } } },
  });
  const unique = [...new Map(rows.map((row) => [`${row.shipment.businessUnitId}\0${row.memo?.trim()}`, row] as const)).values()];
  let translated = 0; let failed = 0;
  for (const row of unique) {
    try { if (await translateAndCacheTrackingText(row.shipment.businessUnitId, row.memo)) translated += 1; }
    catch (error) { failed += 1; console.error(row.memo, error instanceof Error ? error.message : error); }
  }
  console.log(JSON.stringify({ unique: unique.length, translated, failed }));
}
main().finally(() => prisma.$disconnect());
