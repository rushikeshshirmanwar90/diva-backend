import { redirect } from "next/navigation";
import { getAdminSession } from "@/app/admin/_lib/session.server";
import { AdminShell } from "@/app/admin/_components/shell";

/**
 * The authenticated half of the console.
 *
 * A route group `(workspace)` rather than a path segment, so the guard wraps
 * every admin screen without adding `/workspace` to any URL — and crucially,
 * `/admin/login` sits outside this group and stays reachable when there is no
 * session.
 *
 * The check runs on the server before anything renders, so an unauthenticated
 * visitor never receives the markup at all. Client-side redirects flash the
 * protected layout first, which looks broken and briefly leaks structure.
 */
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  const user = await getAdminSession();

  if (!user) {
    redirect("/admin/login");
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
