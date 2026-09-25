import { prisma } from "../src/lib/prisma";
import { autoReleaseDueOrders } from "../src/lib/order-service";

async function main() {
  const result = await autoReleaseDueOrders();
  console.log(`Auto-release: ${result.processed} order diproses.`);
  for (const r of result.results) {
    console.log(`  - ${r.orderId}: ${r.ok ? "selesai" : `gagal (${r.error})`}`);
  }
}

main()
  .catch((error) => {
    console.error("Gagal menjalankan auto-release:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
