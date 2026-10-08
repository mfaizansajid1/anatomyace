import { useEffect, useRef, useState } from "react";
import { Copy, Download, Share2, X } from "lucide-react";
import { toast } from "sonner";

export type Milestone = {
  headline: string; // e.g. "unlocked the Ace badge"
  detail: string; // e.g. "Score 100% on a Test"
};

type Props = {
  milestone: Milestone | null;
  name: string;
  stats: { cards: number; streak: number; xp: number };
  onClose: () => void;
};

const W = 1200;
const H = 630;

function draw(canvas: HTMLCanvasElement, m: Milestone, name: string, stats: Props["stats"]) {
  const ctx = canvas.getContext("2d")!;
  // Fixed brand palette: this is an exported image, not themed UI.
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0b2540");
  g.addColorStop(1, "#0f5c63");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  ctx.fillStyle = "#5eead4";
  ctx.font = "700 34px Outfit, system-ui, sans-serif";
  ctx.fillText("AnatomyAce", 80, 110);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 40px Outfit, system-ui, sans-serif";
  ctx.fillText(name || "An AnatomyAce student", 80, 220);

  ctx.font = "800 64px Outfit, system-ui, sans-serif";
  wrap(ctx, m.headline, 80, 300, W - 160, 74);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "400 30px Outfit, system-ui, sans-serif";
  ctx.fillText(m.detail, 80, 440);

  const pills = [`${stats.cards} items studied`, `${stats.streak}-day streak`, `${stats.xp} XP`];
  let x = 80;
  ctx.font = "600 26px Outfit, system-ui, sans-serif";
  for (const p of pills) {
    const w = ctx.measureText(p).width + 40;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.roundRect(x, 490, w, 52, 26);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(p, x + 20, 525);
    x += w + 16;
  }

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "400 22px Outfit, system-ui, sans-serif";
  ctx.fillText("MBBS Anatomy Revision", W - 330, 110);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

export function MilestoneShareModal({ milestone, name, stats, onClose }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!milestone || !ref.current) return;
    draw(ref.current, milestone, name, stats);
    setUrl(ref.current.toDataURL("image/png"));
  }, [milestone, name, stats]);

  if (!milestone) return null;
  const text = `I just ${milestone.headline} on AnatomyAce! ${typeof window !== "undefined" ? window.location.origin : ""}`;

  async function share() {
    if (!ref.current) return;
    const blob: Blob | null = await new Promise((r) => ref.current!.toBlob(r, "image/png"));
    const file = blob ? new File([blob], "anatomyace-milestone.png", { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast.success("Share text copied"); }
    } catch { /* user cancelled */ }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Share your milestone"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4" onClick={onClose}>
      <div className="card-surface w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">Share your milestone</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <canvas ref={ref} width={W} height={H} className="w-full h-auto rounded-xl border border-border" />
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={share} className="btn-primary"><Share2 className="h-4 w-4" /> Share</button>
          {url && (
            <a href={url} download="anatomyace-milestone.png" className="btn-outline"><Download className="h-4 w-4" /> Download</a>
          )}
          <button onClick={async () => { await navigator.clipboard.writeText(text); toast.success("Copied"); }} className="btn-outline">
            <Copy className="h-4 w-4" /> Copy text
          </button>
        </div>
      </div>
    </div>
  );
}
