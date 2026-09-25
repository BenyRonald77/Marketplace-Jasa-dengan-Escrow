import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const dewiHash = await bcrypt.hash("dewi123", 10);
  const dewi = await prisma.user.upsert({
    where: { email: "dewi@jasa.test" },
    update: {},
    create: { name: "Dewi (Desainer)", email: "dewi@jasa.test", passwordHash: dewiHash, balance: 0 },
  });

  const ekoHash = await bcrypt.hash("eko123", 10);
  await prisma.user.upsert({
    where: { email: "eko@jasa.test" },
    update: {},
    create: { name: "Eko (Pembeli)", email: "eko@jasa.test", passwordHash: ekoHash, balance: 2_000_000 },
  });

  const fajarHash = await bcrypt.hash("fajar123", 10);
  await prisma.user.upsert({
    where: { email: "fajar@jasa.test" },
    update: {},
    create: { name: "Fajar (Pembeli)", email: "fajar@jasa.test", passwordHash: fajarHash, balance: 1_000_000 },
  });

  await prisma.service.upsert({
    where: { id: "service-demo-1" },
    update: {},
    create: {
      id: "service-demo-1",
      sellerId: dewi.id,
      title: "Desain Logo Profesional",
      description: "3 konsep desain logo + revisi tanpa batas, file HD & vektor.",
      price: 500_000,
    },
  });

  await prisma.service.upsert({
    where: { id: "service-demo-2" },
    update: {},
    create: {
      id: "service-demo-2",
      sellerId: dewi.id,
      title: "Desain Postingan Instagram (5 slide)",
      description: "Konten carousel Instagram siap posting, sesuai brand guideline.",
      price: 250_000,
    },
  });

  console.log("Seed selesai:");
  console.log("- Login penjual: dewi@jasa.test / dewi123");
  console.log("- Login pembeli: eko@jasa.test / eko123 (saldo Rp2.000.000)");
  console.log("- Login pembeli: fajar@jasa.test / fajar123 (saldo Rp1.000.000)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
