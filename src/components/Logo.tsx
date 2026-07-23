export function Logo({ size = 48 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))",
        color: "var(--color-primary-foreground)",
      }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>
        <path d="M9 12h2l1-2 2 4 1-2h2"/>
      </svg>
    </div>
  );
}
