import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Spinner } from "@/components/Spinner";

import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log In — AnatomyAce" },
      { name: "description", content: "Log in to AnatomyAce to continue mastering anatomy." },
      { property: "og:title", content: "Log In — AnatomyAce" },
      { property: "og:description", content: "Log in to your AnatomyAce account." },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<"email" | "password", string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends "email" | "password">(k: K, v: string) {
    const next = { ...form, [k]: v };
    setForm(next);
    const r = schema.safeParse(next);
    if (r.success) setErrors({});
    else {
      const fe: typeof errors = {};
      for (const iss of r.error.issues) {
        const key = iss.path[0] as "email" | "password";
        if (key && !fe[key]) fe[key] = iss.message;
      }
      setErrors(fe);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: typeof errors = {};
      for (const iss of parsed.error.issues) {
        const key = iss.path[0] as "email" | "password";
        if (key && !fe[key]) fe[key] = iss.message;
      }
      setErrors(fe);
      return;
    }
    setLoading(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
          navigate({ to: "/verify-email", search: { email: parsed.data.email } });
          return;
        }
        throw error;
      }
      // Update last_login_at (best-effort)
      if (data.user) {
        void supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      setSubmitError(friendlyAuthError(err));
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md card-surface p-6 sm:p-8">
        <div className="flex flex-col items-center">
          <Logo size={52} />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Log in to continue studying.</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
            <input
              id="email" type="email" autoComplete="email"
              value={form.email} onChange={(e) => update("email", e.target.value)}
              className="input-field" required aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && <p id="email-error" className="mt-1 text-xs text-destructive">{errors.email}</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium">Password</label>
              <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                Forgot Password?
              </Link>
            </div>
            <input
              id="password" type="password" autoComplete="current-password"
              value={form.password} onChange={(e) => update("password", e.target.value)}
              className="input-field" required aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            {errors.password && <p id="password-error" className="mt-1 text-xs text-destructive">{errors.password}</p>}
          </div>

          {submitError && (
            <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Spinner /> : null}
            {loading ? "Logging in…" : "Log In"}
          </button>

          <p className="mt-2 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-semibold text-primary hover:underline">Sign Up</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
