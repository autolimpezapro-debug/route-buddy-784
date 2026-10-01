CREATE TABLE public.motoristas (
  id text PRIMARY KEY,
  nome text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motoristas TO anon, authenticated;
GRANT ALL ON public.motoristas TO service_role;
ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura" ON public.motoristas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert" ON public.motoristas FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update" ON public.motoristas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete" ON public.motoristas FOR DELETE TO anon, authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.motoristas;