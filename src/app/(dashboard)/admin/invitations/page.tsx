import { requireAdminPage } from "@/lib/auth/dal";
import { listInvitations } from "@/server/repositories/invitations";
import { InvitationsManager } from "@/components/admin/invitations-manager";

export default async function AdminInvitationsPage() {
  await requireAdminPage();
  const invitations = await listInvitations();

  return (
    <div className="page space-y-6">
      <div>
        <h1 className="page-title">Member Invitations</h1>
      </div>

      <InvitationsManager initialInvitations={invitations} />
    </div>
  );
}
