import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { LoginForm } from "@/app/admin/login/login-form";

/**
 * `useSearchParams()` opts a route out of prerendering unless it sits inside a
 * Suspense boundary — Next cannot know the query string at build time. The
 * boundary lives here so the shell around the form still renders statically,
 * and the form (which reads `?next=`) streams in.
 */
export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <div className="login-checking">
            <Loader2 className="spin" />
            <span>Loading…</span>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
