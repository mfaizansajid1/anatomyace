export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground sm:text-left">
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 sm:justify-start">
          <span>Built by @nexbyfaizan.78</span>
          <span aria-hidden>·</span>
          <a
            href="https://www.instagram.com/nexbyfaizan.78/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Follow us on Instagram
          </a>
        </p>
      </div>
    </footer>
  );
}
