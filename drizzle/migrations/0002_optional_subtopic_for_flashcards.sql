ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE;
UPDATE public.flashcards f SET category_id = s.category_id FROM public.subtopics s WHERE f.subtopic_id = s.id AND f.category_id IS NULL;
ALTER TABLE public.flashcards ALTER COLUMN subtopic_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS flashcards_category_id_idx ON public.flashcards(category_id);