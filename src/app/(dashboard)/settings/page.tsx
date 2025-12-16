import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "@/components/settings/settings-client";

async function getSettingsData(userId: string) {
  const [settings, categories] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId },
    }),
    prisma.chargeCategory.findMany({
      orderBy: { name: "asc" },
    }),
  ]);

  return { settings, categories };
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getSettingsData(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Configurez votre tableau de bord</p>
      </div>

      <SettingsClient
        settings={data.settings}
        categories={data.categories}
        isReadOnly={session.user.role === "TECH"}
      />
    </div>
  );
}
