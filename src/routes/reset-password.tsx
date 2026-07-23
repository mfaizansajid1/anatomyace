import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Spinner } from "@/components/Spinner";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set New Password — AnatomyAce" },
      { name: "description", content: "Choose a new password for your AnatomyAce account." },
      { property: "og:title", content: "Reset Password — AnatomyAce" },
      { property: "og:description", content: "Choose a new password." },
    ],
  }),
  component: ResetPage,
});

const schema = z.object({
  password: z.string().min(8, "At least 8 characters").regex(/\d/, "Must include a number"),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

function ResetPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<Record<"password" | "confirm", string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function update<K extends "password" | "confirm">(k: K, v: string) {
    const next = { ...form, [k]: v };
    setForm(next);
    const r = schema.safeParse(next);
    if (r.success) setErrors({});
    else {
      const fe: typeof errors = {};
      for (const iss of r.error.issues) {
        const key = iss.path[0] as "password" | "confirm";
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
        const key = iss.path[0] as "password" | "confirm";
        if (key && !fe[key]) fe[key] = iss.message;
      }
      setErrors(fe);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/dashboard" }), 900);
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
          <h1 className="mt-4 text-2xl font-bold text-foreground">Set a new password</h1>
        </div>
        {done ? (
          <p className="mt-6 text-center text-sm text-foreground">Password updated. Redirecting…</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">New password</label>
              <input id="password" type="password" autoComplete="new-password" required
                value={form.password} onChange={(e) => update("password", e.target.value)}
                className="input-field" aria-invalid={!!errors.password} />
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium">Confirm password</label>
              <input id="confirm" type="password" autoComplete="new-password" required
                value={form.confirm} onChange={(e) => update("confirm", e.target.value)}
                className="input-field" aria-invalid={!!errors.confirm} />
              {errors.confirm && <p className="mt-1 text-xs text-destructive">{errors.confirm}</p>}
            </div>
            {submitError && (
              <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {submitError}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Spinner /> : null}
              {loading ? "Updating…" : "Update Password"}
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
