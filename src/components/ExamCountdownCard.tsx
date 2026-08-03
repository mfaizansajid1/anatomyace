import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { Spinner } from "@/components/Spinner";

export type ExamSettings = { exam_name: string | null; exam_date: string | null };

function daysLeft(dateStr: string): number {
  const today = new Date();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = dateStr.split("-").map(Number);
  const e = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return Math.round((e - t) / 86_400_000);
}

export function ExamCountdownCard({
  settings,
  pending,
  onSave,
}: {
  settings: ExamSettings;
  pending: boolean;
  onSave: (s: { exam_name: string; exam_date: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const left = useMemo(() => (settings.exam_date ? daysLeft(settings.exam_date) : null), [settings.exam_date]);

  return (
    <div className="card-surface p-5 flex flex-col">
      <div className="flex items-center gap-2">
        <CalendarDays aria-hidden className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Exam Countdown</h2>
      </div>

      {left === null ? (
        <>
          <p className="mt-4 text-foreground">No exam selected.</p>
          <p className="text-sm text-muted-foreground">Choose an exam date to begin.</p>
          <button onClick={() => setOpen(true)} className="btn-primary mt-4 self-start">Set Exam Date</button>
        </>
      ) : (
        <>
          <p className="mt-3 text-foreground font-medium">{settings.exam_name || "My Exam"}</p>
          {left > 0 && (
            <>
              <p className="mt-1 text-4xl font-bold text-foreground">
                {left} <span className="text-base font-medium text-muted-foreground">Days Left</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Stay consistent. Every revision counts.</p>
            </>
          )}
          {left === 0 && (
            <>
              <p className="mt-1 text-3xl font-bold text-foreground">Exam Day!</p>
              <p className="mt-2 text-sm text-muted-foreground">Good luck!</p>
            </>
          )}
          {left < 0 && (
            <>
              <p className="mt-1 text-2xl font-bold text-foreground">Exam completed.</p>
              <p className="mt-2 text-sm text-muted-foreground">Set your next exam date to keep going.</p>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/planner" className="btn-primary">Open Revision Planner</Link>
            <button onClick={() => setOpen(true)} className="btn-outline">Edit</button>
          </div>
        </>
      )}

      {open && (
        <ExamDialog
          initial={settings}
          pending={pending}
          onClose={() => setOpen(false)}
          onSave={(s) => { onSave(s); setOpen(false); }}
        />
      )}
    </div>
  );
}

function ExamDialog({
  initial, pending, onClose, onSave,
}: {
  initial: ExamSettings;
  pending: boolean;
  onClose: () => void;
  onSave: (s: { exam_name: string; exam_date: string }) => void;
}) {
  const [name, setName] = useState(initial.exam_name ?? "MBBS First Professional");
  const [date, setDate] = useState(initial.exam_date ?? "");
  const valid = name.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Exam countdown settings"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div className="card-surface p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-foreground">Exam Countdown</h3>
        <p className="text-sm text-muted-foreground mt-1">Set your exam name and date.</p>

        <label htmlFor="exam-name" className="block mt-4 text-sm font-medium text-foreground">Exam name</label>
        <input
          id="exam-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
          className="input-field mt-1" placeholder="MBBS First Professional"
        />

        <label htmlFor="exam-date" className="block mt-4 text-sm font-medium text-foreground">Exam date</label>
        <input
          id="exam-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="input-field mt-1"
        />

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline" style={{ minHeight: 44 }}>Cancel</button>
          <button
            onClick={() => valid && onSave({ exam_name: name.trim(), exam_date: date })}
            disabled={!valid || pending}
            className="btn-primary" style={{ minHeight: 44 }}
          >
            {pending ? <Spinner className="h-4 w-4" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
