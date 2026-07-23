import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Spinner } from "@/components/Spinner";
import { GoogleButton } from "@/components/GoogleButton";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up — AnatomyAce" },
      { name: "description", content: "Create your AnatomyAce account and start mastering anatomy today." },
      { property: "og:title", content: "Sign Up — AnatomyAce" },
      { property: "og:description", content: "Create your AnatomyAce account." },
    ],
  }),
  component: SignupPage,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/\d/, "Must include at least one number"),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

type FieldErrors = Partial<Record<"full_name" | "email" | "password" | "confirm", string>>;

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    const next = { ...form, [key]: value };
    setForm(next);
    const result = schema.safeParse(next);
    if (result.success) setErrors({});
    else {
      const fe: FieldErrors = {};
      for (const iss of result.error.issues) {
        const k = iss.path[0] as keyof FieldErrors;
        if (k && !fe[k]) fe[k] = iss.message;
      }
      setErrors(fe);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: FieldErrors = {};
      for (const iss of parsed.error.issues) {
        const k = iss.path[0] as keyof FieldErrors;
        if (k && !fe[k]) fe[k] = iss.message;
      }
      setErrors(fe);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: parsed.data.full_name },
        },
      });
      if (error) throw error;
      setSuccess(true);
      // If email confirmation is disabled, session exists; else route to dashboard anyway (they can sign in later)
      setTimeout(() => {
        if (data.session) navigate({ to: "/dashboard" });
        else navigate({ to: "/login" });
      }, 900);
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
          <h1 className="mt-4 text-2xl font-bold text-foreground">Create your account</h1>
          <p className="text-sm text-muted-foreground">Start mastering anatomy today.</p>
        </div>

        {success ? (
          <div className="mt-8 text-center" role="status">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground animate-in zoom-in-50">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="mt-3 font-medium text-foreground">Account created!</p>
            <p className="text-sm text-muted-foreground">Redirecting…</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
            <Field
              label="Full Name" id="full_name" type="text" autoComplete="name"
              value={form.full_name} onChange={(v) => update("full_name", v)} error={errors.full_name}
            />
            <Field
              label="Email" id="email" type="email" autoComplete="email"
              value={form.email} onChange={(v) => update("email", v)} error={errors.email}
            />
            <Field
              label="Password" id="password" type="password" autoComplete="new-password"
              value={form.password} onChange={(v) => update("password", v)} error={errors.password}
              hint="At least 8 characters, including a number."
            />
            <Field
              label="Confirm Password" id="confirm" type="password" autoComplete="new-password"
              value={form.confirm} onChange={(v) => update("confirm", v)} error={errors.confirm}
            />
            {submitError && (
              <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {submitError}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Spinner /> : null}
              {loading ? "Creating account…" : "Sign Up"}
            </button>

            <Divider />
            <GoogleButton onError={setSubmitError} />

            <p className="mt-2 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-semibold text-primary hover:underline">Log In</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

function Field({
  label, id, type, value, onChange, error, autoComplete, hint,
}: {
  label: string; id: string; type: string; value: string;
  onChange: (v: string) => void; error?: string; autoComplete?: string; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="input-field"
        required
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
