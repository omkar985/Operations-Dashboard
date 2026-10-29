import { requireUser } from "@/lib/auth/dal";
import { UserSettingsView } from "@/components/settings/user-settings-view";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="page space-y-6">
      <div>
        <h1 className="page-title">User Preferences</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Manage your account profile and authentication security
        </p>
      </div>

      <UserSettingsView user={user} />
    </div>
  );
}
