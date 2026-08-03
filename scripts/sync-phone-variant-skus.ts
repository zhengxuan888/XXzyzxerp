import { PrismaClient } from "@prisma/client";

import { phoneVariantNames } from "../src/lib/phone-specifications";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, businessUnitId: true, code: true, name: true },
  });
  let matchedProducts = 0;
  let createdSkus = 0;
  let createdBalances = 0;

  for (const product of products) {
    const variants = phoneVariantNames(product.name);
    if (!variants.length) continue;
    matchedProducts += 1;

    const result = await prisma.productSku.createMany({
      data: variants.map((variant) => ({
        productId: product.id,
        code: variant.name,
        attributes: { color: variant.color, capacity: variant.capacity, model: product.name },
        safetyStockQuantity: 0,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    createdSkus += result.count;

    const [sites, variantSkus] = await Promise.all([
      prisma.site.findMany({
        where: { businessUnitId: product.businessUnitId, isActive: true },
        select: { id: true },
      }),
      prisma.productSku.findMany({
        where: { productId: product.id, code: { in: variants.map((variant) => variant.name) } },
        select: { id: true },
      }),
    ]);
    if (!sites.length || !variantSkus.length) continue;

    const balanceResult = await prisma.inventoryBalance.createMany({
      data: variantSkus.flatMap((sku) => sites.map((site) => ({
        businessUnitId: product.businessUnitId,
        siteId: site.id,
        skuId: sku.id,
        onHandQuantity: 0,
        reservedQuantity: 0,
      }))),
      skipDuplicates: true,
    });
    createdBalances += balanceResult.count;
  }

  console.log(JSON.stringify({ matchedProducts, createdSkus, createdBalances }));
}

main()
  .finally(async () => prisma.$disconnect());
