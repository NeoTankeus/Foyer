import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { subDays, subMonths, startOfMonth, addDays } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // ============================================
  // Créer les catégories de charges par défaut
  // ============================================
  console.log("📁 Creating charge categories...");

  const categories = await Promise.all([
    prisma.chargeCategory.upsert({
      where: { name: "Loyer" },
      update: {},
      create: { name: "Loyer", color: "#ef4444", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Électricité" },
      update: {},
      create: { name: "Électricité", color: "#f59e0b", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Internet & Téléphone" },
      update: {},
      create: { name: "Internet & Téléphone", color: "#06b6d4", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Salaires" },
      update: {},
      create: { name: "Salaires", color: "#8b5cf6", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Fournitures" },
      update: {},
      create: { name: "Fournitures", color: "#10b981", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Transport" },
      update: {},
      create: { name: "Transport", color: "#ec4899", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Marketing" },
      update: {},
      create: { name: "Marketing", color: "#6366f1", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Assurances" },
      update: {},
      create: { name: "Assurances", color: "#84cc16", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Comptabilité" },
      update: {},
      create: { name: "Comptabilité", color: "#14b8a6", isDefault: true },
    }),
    prisma.chargeCategory.upsert({
      where: { name: "Divers" },
      update: {},
      create: { name: "Divers", color: "#64748b", isDefault: true },
    }),
  ]);

  console.log(`✅ Created ${categories.length} categories`);

  // ============================================
  // Créer les catégories de stock
  // ============================================
  console.log("📦 Creating stock categories...");

  const stockCategories = await Promise.all([
    prisma.stockCategory.upsert({
      where: { name: "Électronique" },
      update: {},
      create: { name: "Électronique" },
    }),
    prisma.stockCategory.upsert({
      where: { name: "Mobilier" },
      update: {},
      create: { name: "Mobilier" },
    }),
    prisma.stockCategory.upsert({
      where: { name: "Consommables" },
      update: {},
      create: { name: "Consommables" },
    }),
    prisma.stockCategory.upsert({
      where: { name: "Outils" },
      update: {},
      create: { name: "Outils" },
    }),
  ]);

  console.log(`✅ Created ${stockCategories.length} stock categories`);

  // ============================================
  // Créer l'utilisateur admin de démo
  // ============================================
  console.log("👤 Creating demo user...");

  const hashedPassword = await hash("admin123", 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      email: "admin@demo.com",
      password: hashedPassword,
      name: "Admin Demo",
      role: "ADMIN",
    },
  });

  // Créer les paramètres utilisateur
  await prisma.userSettings.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      currency: "EUR",
      locale: "fr-FR",
      monthlyBudget: 15000,
    },
  });

  // Créer un utilisateur tech (lecture seule)
  const techUser = await prisma.user.upsert({
    where: { email: "tech@demo.com" },
    update: {},
    create: {
      email: "tech@demo.com",
      password: hashedPassword,
      name: "Tech Demo",
      role: "TECH",
    },
  });

  console.log(`✅ Created users: ${adminUser.email}, ${techUser.email}`);

  // ============================================
  // Créer des charges de démo (12 derniers mois)
  // ============================================
  console.log("💰 Creating demo charges...");

  const chargeData = [];
  const now = new Date();

  // Charges récurrentes mensuelles
  for (let month = 0; month < 12; month++) {
    const monthDate = subMonths(now, month);
    const monthStart = startOfMonth(monthDate);

    // Loyer
    chargeData.push({
      userId: adminUser.id,
      date: addDays(monthStart, 4),
      amount: 2500,
      categoryId: categories[0].id, // Loyer
      supplier: "SCI Immobilier Pro",
      paymentMethod: "transfer",
      isRecurring: true,
      recurrence: "monthly",
      note: "Loyer mensuel bureaux",
    });

    // Électricité
    chargeData.push({
      userId: adminUser.id,
      date: addDays(monthStart, 15),
      amount: 180 + Math.random() * 50,
      categoryId: categories[1].id, // Électricité
      supplier: "EDF Pro",
      paymentMethod: "direct_debit",
      isRecurring: true,
      recurrence: "monthly",
    });

    // Internet
    chargeData.push({
      userId: adminUser.id,
      date: addDays(monthStart, 10),
      amount: 89.99,
      categoryId: categories[2].id, // Internet
      supplier: "Orange Business",
      paymentMethod: "direct_debit",
      isRecurring: true,
      recurrence: "monthly",
    });

    // Salaires (variable)
    chargeData.push({
      userId: adminUser.id,
      date: addDays(monthStart, 28),
      amount: 8000 + Math.random() * 2000,
      categoryId: categories[3].id, // Salaires
      paymentMethod: "transfer",
      isRecurring: true,
      recurrence: "monthly",
      note: "Salaires équipe",
    });

    // Charges variables aléatoires
    const randomCharges = Math.floor(Math.random() * 5) + 2;
    for (let i = 0; i < randomCharges; i++) {
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      chargeData.push({
        userId: adminUser.id,
        date: addDays(monthStart, Math.floor(Math.random() * 28)),
        amount: Math.round((50 + Math.random() * 500) * 100) / 100,
        categoryId: randomCategory.id,
        supplier: ["Amazon Business", "Bureau Vallée", "Uber", "SNCF", "Fnac Pro"][Math.floor(Math.random() * 5)],
        paymentMethod: ["card", "transfer", "cash"][Math.floor(Math.random() * 3)],
        isRecurring: false,
      });
    }
  }

  // Insérer toutes les charges
  await prisma.charge.createMany({
    data: chargeData,
  });

  console.log(`✅ Created ${chargeData.length} charges`);

  // ============================================
  // Créer des articles de stock de démo
  // ============================================
  console.log("📦 Creating demo stock items...");

  const stockItems = [
    {
      userId: adminUser.id,
      name: "MacBook Pro 14\"",
      sku: "APPLE-MBP14-001",
      categoryId: stockCategories[0].id,
      quantity: 5,
      alertThreshold: 2,
      purchasePrice: 2499,
      location: "Bureau principal - Armoire A",
    },
    {
      userId: adminUser.id,
      name: "Écran Dell 27\"",
      sku: "DELL-MON27-001",
      categoryId: stockCategories[0].id,
      quantity: 8,
      alertThreshold: 3,
      purchasePrice: 399,
      location: "Bureau principal - Armoire A",
    },
    {
      userId: adminUser.id,
      name: "Clavier Magic Keyboard",
      sku: "APPLE-KB-001",
      categoryId: stockCategories[0].id,
      quantity: 12,
      alertThreshold: 5,
      purchasePrice: 129,
      location: "Stock informatique",
    },
    {
      userId: adminUser.id,
      name: "Souris Magic Mouse",
      sku: "APPLE-MS-001",
      categoryId: stockCategories[0].id,
      quantity: 3, // Sous le seuil d'alerte
      alertThreshold: 5,
      purchasePrice: 99,
      location: "Stock informatique",
    },
    {
      userId: adminUser.id,
      name: "Bureau réglable",
      sku: "FLEXISPOT-E7-001",
      categoryId: stockCategories[1].id,
      quantity: 4,
      alertThreshold: 2,
      purchasePrice: 549,
      location: "Entrepôt",
    },
    {
      userId: adminUser.id,
      name: "Chaise ergonomique",
      sku: "HERMAN-AERON-001",
      categoryId: stockCategories[1].id,
      quantity: 6,
      alertThreshold: 2,
      purchasePrice: 1199,
      location: "Entrepôt",
    },
    {
      userId: adminUser.id,
      name: "Ramettes papier A4",
      sku: "PAPER-A4-500",
      categoryId: stockCategories[2].id,
      quantity: 25,
      alertThreshold: 10,
      purchasePrice: 4.99,
      location: "Salle copies",
    },
    {
      userId: adminUser.id,
      name: "Cartouches encre HP",
      sku: "HP-INK-BK-001",
      categoryId: stockCategories[2].id,
      quantity: 2, // Sous le seuil d'alerte
      alertThreshold: 5,
      purchasePrice: 35,
      location: "Salle copies",
    },
    {
      userId: adminUser.id,
      name: "Tournevis multi-embouts",
      sku: "TOOL-SCRW-001",
      categoryId: stockCategories[3].id,
      quantity: 3,
      alertThreshold: 1,
      purchasePrice: 29.99,
      location: "Local technique",
    },
    {
      userId: adminUser.id,
      name: "Câbles USB-C (lot 10)",
      sku: "CABLE-USBC-10",
      categoryId: stockCategories[0].id,
      quantity: 15,
      alertThreshold: 5,
      purchasePrice: 49.99,
      location: "Stock informatique",
    },
  ];

  for (const item of stockItems) {
    const createdItem = await prisma.stockItem.create({
      data: item,
    });

    // Créer un mouvement initial
    if (item.quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          userId: adminUser.id,
          itemId: createdItem.id,
          type: "IN",
          quantity: item.quantity,
          comment: "Stock initial",
        },
      });
    }
  }

  // Ajouter quelques mouvements de démo
  const souris = await prisma.stockItem.findFirst({
    where: { sku: "APPLE-MS-001" },
  });

  if (souris) {
    await prisma.stockMovement.create({
      data: {
        userId: adminUser.id,
        itemId: souris.id,
        type: "OUT",
        quantity: 2,
        date: subDays(now, 5),
        comment: "Fourniture nouveau collaborateur",
      },
    });
  }

  console.log(`✅ Created ${stockItems.length} stock items`);

  console.log("\n🎉 Seed completed successfully!");
  console.log("\n📋 Demo accounts:");
  console.log("   Admin: admin@demo.com / admin123");
  console.log("   Tech (read-only): tech@demo.com / admin123");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
