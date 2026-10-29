import { requireUser } from "@/lib/auth/dal";
import { getFreshness } from "@/server/services/dataset-service";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const freshness = await getFreshness();

  return (
    <DashboardShell user={user} freshness={freshness}>
      {children}
    </DashboardShell>
  );
}
