import { prisma } from "../src/lib/prisma";
import { trackingTextHash, translateAndCacheTrackingText } from "../src/lib/tracking-translation-service";

async function main() {
  const forceGoogle = process.argv.includes("--force-google");
  const rows = await prisma.shipmentEvent.findMany({
    where: { memo: { not: null } },
    select: { memo: true, shipment: { select: { businessUnitId: true } } },
  });
  const empty = rows.filter((row) => !row.memo?.trim()).length;
  const unique = [...new Map(rows
    .filter((row) => Boolean(row.memo?.trim()))
    .map((row) => [`${row.shipment.businessUnitId}\0${row.memo?.trim()}`, row] as const)).values()];
  let translated = 0; let failed = 0;
  for (const row of unique) {
    try { if (await translateAndCacheTrackingText(row.shipment.businessUnitId, row.memo, { forceGoogle })) translated += 1; }
    catch (error) { failed += 1; console.error(row.memo, error instanceof Error ? error.message : error); }
  }
  const cached = await prisma.trackingTranslation.findMany({
    where: {
      OR: unique.map((row) => ({
        businessUnitId: row.shipment.businessUnitId,
        sourceHash: trackingTextHash(row.memo!),
      })),
    },
    select: { provider: true },
  });
  const providers = cached.reduce<Record<string, number>>((result, row) => {
    result[row.provider] = (result[row.provider] ?? 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({ unique: unique.length, empty, translated, failed, providers, forceGoogle }));
}
main().finally(() => prisma.$disconnect());
