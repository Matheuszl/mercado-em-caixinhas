-- Households (a "casa" shared by its members)
CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Nossa casa',
  invite_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.household_members (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  email text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

CREATE TABLE public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_amount numeric(12,2) NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, year_month)
);

CREATE TABLE public.month_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id uuid NOT NULL REFERENCES public.months(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  name text NOT NULL,
  budget numeric(12,2) NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  UNIQUE (month_id, source_id)
);

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  month_id uuid NOT NULL REFERENCES public.months(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.sources(id),
  access_key text,
  store_name text NOT NULL DEFAULT 'Mercado',
  store_cnpj text,
  store_address text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  qr_url text,
  origin text NOT NULL DEFAULT 'nfce' CHECK (origin IN ('nfce','manual')),
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX receipts_household_access_key_uidx ON public.receipts(household_id, access_key) WHERE access_key IS NOT NULL;
CREATE INDEX receipts_month_idx ON public.receipts(month_id);

CREATE TABLE public.receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  description text NOT NULL,
  code text,
  quantity numeric(12,4),
  unit text,
  unit_price numeric(12,4),
  total_price numeric(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX receipt_items_receipt_idx ON public.receipt_items(receipt_id);

-- Grants
GRANT SELECT, UPDATE ON public.households TO authenticated;
GRANT SELECT ON public.household_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO authenticated;
GRANT SELECT ON public.months TO authenticated;
GRANT SELECT, UPDATE ON public.month_sources TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_items TO authenticated;
GRANT ALL ON public.households, public.household_members, public.sources, public.months, public.month_sources, public.receipts, public.receipt_items TO service_role;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.month_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- Membership helper
CREATE OR REPLACE FUNCTION public.is_household_member(_household uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = _household AND user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid) TO authenticated;

-- Policies
CREATE POLICY "members read household" ON public.households FOR SELECT TO authenticated USING (public.is_household_member(id));
CREATE POLICY "members update household" ON public.households FOR UPDATE TO authenticated USING (public.is_household_member(id)) WITH CHECK (public.is_household_member(id));

CREATE POLICY "members read members" ON public.household_members FOR SELECT TO authenticated USING (public.is_household_member(household_id));

CREATE POLICY "members read sources" ON public.sources FOR SELECT TO authenticated USING (public.is_household_member(household_id));
CREATE POLICY "members insert sources" ON public.sources FOR INSERT TO authenticated WITH CHECK (public.is_household_member(household_id));
CREATE POLICY "members update sources" ON public.sources FOR UPDATE TO authenticated USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));
CREATE POLICY "members delete sources" ON public.sources FOR DELETE TO authenticated USING (public.is_household_member(household_id));

CREATE POLICY "members read months" ON public.months FOR SELECT TO authenticated USING (public.is_household_member(household_id));

CREATE POLICY "members read month sources" ON public.month_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.months m WHERE m.id = month_id AND public.is_household_member(m.household_id)));
CREATE POLICY "members update month sources" ON public.month_sources FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.months m WHERE m.id = month_id AND public.is_household_member(m.household_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.months m WHERE m.id = month_id AND public.is_household_member(m.household_id)));

CREATE POLICY "members read receipts" ON public.receipts FOR SELECT TO authenticated USING (public.is_household_member(household_id));
CREATE POLICY "members update receipts" ON public.receipts FOR UPDATE TO authenticated USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id));
CREATE POLICY "members delete receipts" ON public.receipts FOR DELETE TO authenticated USING (public.is_household_member(household_id));

CREATE POLICY "members read items" ON public.receipt_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_id AND public.is_household_member(r.household_id)));
CREATE POLICY "members write items" ON public.receipt_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_id AND public.is_household_member(r.household_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_id AND public.is_household_member(r.household_id)));

-- Create a household for the current user, seeded with the default sources
CREATE OR REPLACE FUNCTION public.create_household(p_name text, p_display_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_code text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já faz parte de uma casa';
  END IF;
  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM households WHERE invite_code = v_code);
  END LOOP;
  INSERT INTO households(name, invite_code) VALUES (coalesce(nullif(trim(p_name), ''), 'Nossa casa'), v_code) RETURNING id INTO v_id;
  INSERT INTO household_members(household_id, user_id, display_name, email)
    VALUES (v_id, auth.uid(), coalesce(p_display_name, ''), auth.jwt() ->> 'email');
  INSERT INTO sources(household_id, name, default_amount, position) VALUES
    (v_id, 'Matheus', 1200.00, 0),
    (v_id, 'Maria', 500.00, 1);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.join_household(p_code text, p_display_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Você já faz parte de uma casa';
  END IF;
  SELECT id INTO v_id FROM households WHERE invite_code = upper(trim(p_code));
  IF v_id IS NULL THEN RAISE EXCEPTION 'Código de convite não encontrado'; END IF;
  INSERT INTO household_members(household_id, user_id, display_name, email)
    VALUES (v_id, auth.uid(), coalesce(p_display_name, ''), auth.jwt() ->> 'email');
  RETURN v_id;
END $$;

-- Ensure a month "caixinha" exists, snapshotting the default amounts of active sources
CREATE OR REPLACE FUNCTION public.ensure_month(p_household uuid, p_ym text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_household_member(p_household) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_ym !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'invalid month'; END IF;
  SELECT id INTO v_id FROM months WHERE household_id = p_household AND year_month = p_ym;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO months(household_id, year_month) VALUES (p_household, p_ym)
    ON CONFLICT (household_id, year_month) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM months WHERE household_id = p_household AND year_month = p_ym;
    RETURN v_id;
  END IF;
  INSERT INTO month_sources(month_id, source_id, name, budget, position)
    SELECT v_id, s.id, s.name, s.default_amount, s.position FROM sources s
    WHERE s.household_id = p_household AND s.active
    ON CONFLICT DO NOTHING;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_current_month(p_household uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.ensure_month(p_household, to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'))
$$;

-- After editing defaults: add new sources to the current month and optionally reset its budgets to the defaults
CREATE OR REPLACE FUNCTION public.sync_current_month(p_household uuid, p_update_budgets boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_month uuid;
BEGIN
  v_month := ensure_current_month(p_household);
  INSERT INTO month_sources(month_id, source_id, name, budget, position)
    SELECT v_month, s.id, s.name, s.default_amount, s.position FROM sources s
    WHERE s.household_id = p_household AND s.active
    ON CONFLICT (month_id, source_id) DO NOTHING;
  IF p_update_budgets THEN
    UPDATE month_sources ms SET budget = s.default_amount, name = s.name, position = s.position
      FROM sources s WHERE ms.month_id = v_month AND ms.source_id = s.id;
  ELSE
    UPDATE month_sources ms SET name = s.name, position = s.position
      FROM sources s WHERE ms.month_id = v_month AND ms.source_id = s.id;
  END IF;
END $$;

-- Save a receipt with its items; month comes from the emission date (São Paulo time)
CREATE OR REPLACE FUNCTION public.add_receipt(
  p_household uuid, p_source uuid, p_access_key text, p_store_name text, p_store_cnpj text,
  p_store_address text, p_issued_at timestamptz, p_total numeric, p_qr_url text, p_origin text, p_items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_month uuid; v_id uuid; v_ym text; v_name text;
BEGIN
  IF NOT is_household_member(p_household) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sources WHERE id = p_source AND household_id = p_household) THEN
    RAISE EXCEPTION 'Fonte inválida';
  END IF;
  IF p_total IS NULL OR p_total < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF p_access_key IS NOT NULL AND EXISTS (SELECT 1 FROM receipts WHERE household_id = p_household AND access_key = p_access_key) THEN
    RAISE EXCEPTION 'Essa nota já foi lançada';
  END IF;
  v_ym := to_char(coalesce(p_issued_at, now()) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_month := ensure_month(p_household, v_ym);
  INSERT INTO month_sources(month_id, source_id, name, budget, position)
    SELECT v_month, s.id, s.name, 0, s.position FROM sources s WHERE s.id = p_source
    ON CONFLICT (month_id, source_id) DO NOTHING;
  SELECT display_name INTO v_name FROM household_members WHERE user_id = auth.uid();
  INSERT INTO receipts(household_id, month_id, source_id, access_key, store_name, store_cnpj, store_address,
                       issued_at, total, qr_url, origin, created_by, created_by_name)
  VALUES (p_household, v_month, p_source, nullif(p_access_key, ''), coalesce(nullif(trim(p_store_name), ''), 'Mercado'),
          p_store_cnpj, p_store_address, coalesce(p_issued_at, now()), round(p_total, 2), p_qr_url,
          coalesce(p_origin, 'nfce'), auth.uid(), v_name)
  RETURNING id INTO v_id;
  INSERT INTO receipt_items(receipt_id, position, description, code, quantity, unit, unit_price, total_price)
    SELECT v_id, (ord - 1)::int, coalesce(nullif(trim(e->>'description'), ''), 'Item'), e->>'code',
           nullif(e->>'quantity', '')::numeric, e->>'unit', nullif(e->>'unit_price', '')::numeric,
           coalesce(nullif(e->>'total_price', '')::numeric, 0)
    FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord);
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_household(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_household(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_month(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_current_month(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_current_month(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_receipt(uuid, uuid, text, text, text, text, timestamptz, numeric, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_month(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_current_month(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_current_month(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_receipt(uuid, uuid, text, text, text, text, timestamptz, numeric, text, text, jsonb) TO authenticated;