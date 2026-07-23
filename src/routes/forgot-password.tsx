import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Spinner } from "@/components/Spinner";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — AnatomyAce" },
      { name: "description", content: "Reset your AnatomyAce password." },
      { property: "og:title", content: "Forgot Password — AnatomyAce" },
      { property: "og:description", content: "Reset your AnatomyAce password." },
    ],
  }),
  component: ForgotPage,
});

const schema = z.object({ email: z.string().trim().email("Enter a valid email") });

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  function onChange(v: string) {
    setEmail(v);
    const r = schema.safeParse({ email: v });
    setFieldError(r.success ? null : r.error.issues[0]?.message ?? null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      // Still show generic success message to prevent user enumeration
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md card-surface p-6 sm:p-8">
        <div className="flex flex-col items-center">
          <Logo size={52} />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Reset your password</h1>
          <p className="text-sm text-muted-foreground text-center">
            Enter your email and we'll send a reset link.
          </p>
        </div>

        {sent ? (
          <div className="mt-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v16H4z" /><path d="M4 4l8 8 8-8" />
              </svg>
            </div>
            <p className="mt-4 text-sm text-foreground">
              If this email exists, a reset link has been sent.
            </p>
            <Link to="/login" className="btn-primary mt-6 inline-flex">Back to Log In</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
              <input
                id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => onChange(e.target.value)}
                className="input-field" aria-invalid={!!fieldError}
                aria-describedby={fieldError ? "email-error" : undefined}
              />
              {fieldError && <p id="email-error" className="mt-1 text-xs text-destructive">{fieldError}</p>}
            </div>
            {error && (
              <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Spinner /> : null}
              {loading ? "Sending…" : "Send Reset Link"}
            </button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="font-semibold text-primary hover:underline">Back to Log In</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
