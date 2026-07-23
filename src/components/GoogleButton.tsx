import { useState } from "react";
import { lovable } from "@/integrations/lovable";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Spinner } from "./Spinner";

export function GoogleButton({ onError }: { onError?: (msg: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        onError?.(friendlyAuthError(result.error));
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      // Session set — navigate to dashboard
      window.location.assign("/dashboard");
    } catch (e) {
      onError?.(friendlyAuthError(e));
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="btn-outline w-full"
      aria-label="Continue with Google"
    >
      {loading ? (
        <Spinner />
      ) : (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.3l-6.2-5.2C29.2 34.9 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41.9 34.9 44 30 44 24c0-1.3-.1-2.3-.4-3.5z"/>
        </svg>
      )}
      <span>Continue with Google</span>
    </button>
  );
}
