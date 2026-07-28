import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Spinner } from "@/components/Spinner";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — AnatomyAce" },
      { name: "description", content: "Manage your AnatomyAce profile details." },
      { property: "og:title", content: "Profile — AnatomyAce" },
      { property: "og:description", content: "Manage your AnatomyAce profile." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "At least 2 characters").max(100),
  profile_photo_url: z
    .string()
    .trim()
    .max(500)
    .url("Enter a valid URL")
    .or(z.literal("")),
});

type Profile = {
  id: string;
  full_name: string;
  email: string;
  auth_provider: string;
  profile_photo_url: string | null;
  created_at: string;
  last_login_at: string;
};

function ProfilePage() {
  const navigate = useNavigate();
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; profile: Profile }
  >({ status: "loading" });
  const [form, setForm] = useState({ full_name: "", profile_photo_url: "" });
  const [errors, setErrors] = useState<Partial<Record<"full_name" | "profile_photo_url", string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      if (!userData.user) { navigate({ to: "/login" }); return; }
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setSubmitError("Could not load your profile.");
        return;
      }
      const p = data as Profile;
      setState({ status: "ready", profile: p });
      setForm({ full_name: p.full_name ?? "", profile_photo_url: p.profile_photo_url ?? "" });
    })();
    return () => { active = false; };
  }, [navigate]);

  function update<K extends keyof typeof form>(k: K, v: string) {
    const next = { ...form, [k]: v };
    setForm(next);
    setSaved(false);
    const r = schema.safeParse(next);
    if (r.success) setErrors({});
    else {
      const fe: typeof errors = {};
      for (const iss of r.error.issues) {
        const key = iss.path[0] as keyof typeof errors;
        if (key && !fe[key]) fe[key] = iss.message;
      }
      setErrors(fe);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (state.status !== "ready") return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: typeof errors = {};
      for (const iss of parsed.error.issues) {
        const key = iss.path[0] as keyof typeof errors;
        if (key && !fe[key]) fe[key] = iss.message;
      }
      setErrors(fe);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          full_name: parsed.data.full_name,
          profile_photo_url: parsed.data.profile_photo_url || null,
        })
        .eq("id", state.profile.id);
      if (error) throw error;
      setState({ status: "ready", profile: { ...state.profile, full_name: parsed.data.full_name, profile_photo_url: parsed.data.profile_photo_url || null } });
      setSaved(true);
    } catch (err) {
      setSubmitError(friendlyAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  if (state.status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="h-6 w-6 text-primary" />
      </main>
    );
  }

  const { profile } = state;
  const initials = (form.full_name || profile.email || "?")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/dashboard" className="flex items-center gap-3">
            <Logo size={36} />
            <span className="font-semibold text-foreground">AnatomyAce</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/dashboard" className="btn-outline" style={{ minHeight: 40 }}>Back</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-bold text-foreground">Your Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage how you appear in AnatomyAce.</p>

        <div className="mt-8 card-surface p-6 sm:p-8">
          <div className="flex items-center gap-4">
            {form.profile_photo_url ? (
              <img
                src={form.profile_photo_url}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover border border-border"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-2xl font-bold">
                {initials}
              </div>
            )}
            <div>
              <p className="font-semibold text-foreground">{profile.full_name || "Unnamed"}</p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <p className="mt-1 text-xs text-muted-foreground capitalize">
                Signed in with {profile.auth_provider}
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="full_name" className="mb-1.5 block text-sm font-medium">Full Name</label>
              <input
                id="full_name" type="text" value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                className="input-field" required aria-invalid={!!errors.full_name}
              />
              {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
            </div>
            <div>
              <label htmlFor="profile_photo_url" className="mb-1.5 block text-sm font-medium">Profile Photo URL</label>
              <input
                id="profile_photo_url" type="url" value={form.profile_photo_url}
                onChange={(e) => update("profile_photo_url", e.target.value)}
                placeholder="https://…" className="input-field" aria-invalid={!!errors.profile_photo_url}
              />
              {errors.profile_photo_url
                ? <p className="mt-1 text-xs text-destructive">{errors.profile_photo_url}</p>
                : <p className="mt-1 text-xs text-muted-foreground">Paste a link to an image. Leave blank to use initials.</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <input value={profile.email} disabled className="input-field opacity-70" />
              <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed here.</p>
            </div>

            {submitError && (
              <div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{submitError}</div>
            )}
            {saved && !submitError && (
              <div role="status" className="rounded-lg bg-accent/20 px-3 py-2 text-sm text-foreground">
                Profile updated.
              </div>
            )}

            <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto">
              {saving ? <Spinner /> : null}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border text-xs text-muted-foreground grid gap-1">
            <div>Joined: {new Date(profile.created_at).toLocaleDateString()}</div>
            <div>Last login: {new Date(profile.last_login_at).toLocaleString()}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
