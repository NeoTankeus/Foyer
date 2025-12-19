import { auth } from "@/lib/auth";
import { getAllUsers } from "@/lib/db";
import { redirect } from "next/navigation";
import { ConsoleClient } from "@/components/console/console-client";

export default async function ConsolePage() {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const users = await getAllUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Console d&apos;administration</h1>
        <p className="text-muted-foreground">
          Gérez les utilisateurs et réinitialisez les mots de passe
        </p>
      </div>

      <ConsoleClient users={users} />
    </div>
  );
}
