import { redirect } from "next/navigation";

/**
 * The root route has no content of its own — this app is the API server plus
 * the admin console. Redirect immediately so that visiting `/` lands on the
 * admin workspace (which will itself redirect to `/admin/login` if there is no
 * active session).
 */
export default function RootPage() {
  redirect("/admin");
}
