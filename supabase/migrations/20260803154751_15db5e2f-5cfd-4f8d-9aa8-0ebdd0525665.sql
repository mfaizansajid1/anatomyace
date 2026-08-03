ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS exam_name text,
  ADD COLUMN IF NOT EXISTS exam_date date;