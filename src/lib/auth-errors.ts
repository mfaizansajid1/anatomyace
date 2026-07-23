export function friendlyAuthError(err: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "No internet connection. Please try again.";
  }
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!msg) return "Something went wrong. Please try again.";
  if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already")) {
    return "This email is already in use. Try logging in instead.";
  }
  if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("invalid email or password")) {
    return "Incorrect email or password.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please confirm your email before logging in.";
  }
  if (msg.includes("password should be") || msg.includes("password")) {
    return "Password does not meet requirements.";
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "No internet connection. Please try again.";
  }
  if (msg.includes("rate")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return "Something went wrong. Please try again.";
}
