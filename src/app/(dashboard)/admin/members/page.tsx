import { requireAdminPage } from "@/lib/auth/dal";
import { listUsers } from "@/server/repositories/users";
import { MembersManager } from "@/components/admin/members-manager";

export default async function AdminMembersPage() {
  const currentUser = await requireAdminPage();
  const users = await listUsers();

  return (
    <div className="page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Team Member Administration</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Manage roles, view access logs, and control member authorization
          </p>
        </div>
      </div>

      <MembersManager currentUser={currentUser} initialUsers={users} />
    </div>
  );
}
