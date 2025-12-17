import { auth } from "@/lib/auth";
import { getUserSettings, getAllCategories } from "@/lib/db";
import { SettingsClient } from "@/components/settings/settings-client";

function getSettingsData(userId: string) {
  const settings = getUserSettings(userId);
  const categories = getAllCategories();

  return { settings, categories };
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = getSettingsData(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Configurez votre tableau de bord</p>
      </div>

      <SettingsClient
        settings={data.settings ?? null}
        categories={data.categories}
        isReadOnly={session.user.role === "TECH"}
      />
    </div>
  );
}
