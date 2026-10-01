CREATE TABLE public.pedidos (
  id text PRIMARY KEY,
  dados jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO anon, authenticated;
GRANT ALL ON public.pedidos TO service_role;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso publico leitura" ON public.pedidos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "acesso publico insert" ON public.pedidos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "acesso publico update" ON public.pedidos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "acesso publico delete" ON public.pedidos FOR DELETE TO anon, authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;