import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Spinner } from "@/components/Spinner";
import { Logo } from "@/components/Logo";

const search = z.object({ email: z.string().email().optional() });

export const Route = createFileRoute("/verify-email")({
  validateSearch: (s) => search.parse(s),
  head: () => ({
    meta: [
      { title: "Verify your email — AnatomyAce" },
      { name: "description", content: "Confirm your email address to activate your AnatomyAce account." },
      { property: "og:title", content: "Verify your email — AnatomyAce" },
      { property: "og:description", content: "Confirm your email to activate your account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email: initialEmail } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // If already signed in & confirmed, go to dashboard.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (data.user?.email_confirmed_at) navigate({ to: "/dashboard" });
    })();
    return () => { active = false; };
  }, [navigate]);

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !z.string().email().safeParse(email).success) {
      setError("Enter a valid email");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setSent(true);
      setCooldown(30);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md card-surface p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Logo size={52} />
          <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground">Verify your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link{email ? <> to <span className="font-medium text-foreground">{email}</span></> : ""}.
            Click it to activate your account.
          </p>
        </div>

        <form onSubmit={onResend} className="mt-6 flex flex-col gap-3">
          <label htmlFor="v-email" className="text-sm font-medium">Email</label>
          <input
            id="v-email" type="email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="input-field" required
          />
          {error && (
            <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          {sent && !error && (
            <div role="status" className="rounded-lg bg-accent/20 px-3 py-2 text-sm text-foreground">
              Verification email sent. Check your inbox (and spam folder).
            </div>
          )}
          <button type="submit" disabled={loading || cooldown > 0} className="btn-primary w-full">
            {loading ? <Spinner /> : null}
            {loading ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
          </button>
          <Link to="/login" className="btn-outline w-full">Back to Log In</Link>
        </form>
      </div>
    </main>
  );
}
