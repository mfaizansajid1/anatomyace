
-- 1. card_reviews table
CREATE TABLE public.card_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  next_review_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_rating TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, flashcard_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_reviews TO authenticated;
GRANT ALL ON public.card_reviews TO service_role;

ALTER TABLE public.card_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own reviews"
  ON public.card_reviews FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER card_reviews_set_updated_at
  BEFORE UPDATE ON public.card_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX card_reviews_user_due_idx ON public.card_reviews (user_id, next_review_date);

-- 2. record_card_review RPC
CREATE OR REPLACE FUNCTION public.record_card_review(_flashcard_id UUID, _rating TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  interval_val INTERVAL;
  next_dt TIMESTAMPTZ;
  today DATE := (now() AT TIME ZONE 'UTC')::date;
  t_id UUID;
  t_name TEXT;
  cur_stats RECORD;
  new_streak INTEGER;
  new_today INTEGER;
  total_reviews INTEGER;
  good_reviews INTEGER;
  accuracy INTEGER;
  due_count INTEGER;
  week_count INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _rating NOT IN ('again','hard','good','easy') THEN
    RAISE EXCEPTION 'Invalid rating';
  END IF;

  interval_val := CASE _rating
    WHEN 'again' THEN INTERVAL '10 minutes'
    WHEN 'hard'  THEN INTERVAL '1 day'
    WHEN 'good'  THEN INTERVAL '3 days'
    WHEN 'easy'  THEN INTERVAL '7 days'
  END;
  next_dt := now() + interval_val;

  -- upsert card_reviews
  INSERT INTO public.card_reviews (user_id, flashcard_id, next_review_date, last_rating, review_count)
  VALUES (uid, _flashcard_id, next_dt, _rating, 1)
  ON CONFLICT (user_id, flashcard_id) DO UPDATE
    SET next_review_date = EXCLUDED.next_review_date,
        last_rating = EXCLUDED.last_rating,
        review_count = public.card_reviews.review_count + 1,
        updated_at = now();

  -- topic info from flashcard
  SELECT topic_id INTO t_id FROM public.flashcards WHERE id = _flashcard_id;
  SELECT name INTO t_name FROM public.topics WHERE id = t_id;

  -- ensure user_stats row
  INSERT INTO public.user_stats (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  SELECT * INTO cur_stats FROM public.user_stats WHERE user_id = uid;

  -- streak
  IF cur_stats.last_study_date IS NULL THEN
    new_streak := 1;
  ELSIF cur_stats.last_study_date = today THEN
    new_streak := GREATEST(cur_stats.current_streak, 1);
  ELSIF cur_stats.last_study_date = today - 1 THEN
    new_streak := cur_stats.current_streak + 1;
  ELSE
    new_streak := 1;
  END IF;

  -- today counter reset if new day
  IF cur_stats.last_study_date = today THEN
    new_today := cur_stats.cards_studied_today + 1;
  ELSE
    new_today := 1;
  END IF;

  -- log study_activity for today
  INSERT INTO public.study_activity (user_id, study_date, cards_studied)
  VALUES (uid, today, 1)
  ON CONFLICT (user_id, study_date) DO UPDATE
    SET cards_studied = public.study_activity.cards_studied + 1;

  -- week count from activity (last 7 days incl today)
  SELECT COALESCE(SUM(cards_studied),0) INTO week_count
  FROM public.study_activity
  WHERE user_id = uid AND study_date > today - 7;

  UPDATE public.user_stats
    SET cards_studied_today = new_today,
        cards_studied_total = cards_studied_total + 1,
        cards_studied_this_week = week_count,
        current_streak = new_streak,
        longest_streak = GREATEST(longest_streak, new_streak),
        last_study_date = today,
        last_topic_studied = COALESCE(t_name, last_topic_studied),
        updated_at = now()
    WHERE user_id = uid;

  -- topic accuracy + due count
  IF t_id IS NOT NULL AND t_name IS NOT NULL THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE last_rating IN ('good','easy'))
      INTO total_reviews, good_reviews
    FROM public.card_reviews cr
    JOIN public.flashcards f ON f.id = cr.flashcard_id
    WHERE cr.user_id = uid AND f.topic_id = t_id;

    accuracy := CASE WHEN total_reviews = 0 THEN 0
                     ELSE ROUND((good_reviews::numeric / total_reviews) * 100) END;

    SELECT COUNT(*) INTO due_count
    FROM public.flashcards f
    LEFT JOIN public.card_reviews cr
      ON cr.flashcard_id = f.id AND cr.user_id = uid
    WHERE f.topic_id = t_id
      AND f.is_published = true
      AND (cr.next_review_date IS NULL OR cr.next_review_date <= now());

    INSERT INTO public.topic_performance (user_id, topic_name, accuracy_percentage, cards_due_count)
    VALUES (uid, t_name, accuracy, due_count)
    ON CONFLICT (user_id, topic_name) DO UPDATE
      SET accuracy_percentage = EXCLUDED.accuracy_percentage,
          cards_due_count = EXCLUDED.cards_due_count,
          updated_at = now();
  END IF;
END;
$$;

-- topic_performance needs a unique constraint for the upsert above
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'topic_performance_user_topic_unique'
  ) THEN
    ALTER TABLE public.topic_performance
      ADD CONSTRAINT topic_performance_user_topic_unique UNIQUE (user_id, topic_name);
  END IF;
END $$;

-- study_activity needs a unique (user_id, study_date) for the upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'study_activity_user_date_unique'
  ) THEN
    ALTER TABLE public.study_activity
      ADD CONSTRAINT study_activity_user_date_unique UNIQUE (user_id, study_date);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.record_card_review(UUID, TEXT) TO authenticated;

-- 3. live cards-due count for the signed-in user
CREATE OR REPLACE FUNCTION public.cards_due_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.flashcards f
  LEFT JOIN public.card_reviews cr
    ON cr.flashcard_id = f.id AND cr.user_id = auth.uid()
  WHERE f.is_published = true
    AND (cr.next_review_date IS NULL OR cr.next_review_date <= now())
    AND auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.cards_due_count() TO authenticated;
