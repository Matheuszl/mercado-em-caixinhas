ALTER TABLE public.sources ADD COLUMN closing_day integer NOT NULL DEFAULT 1 CHECK (closing_day BETWEEN 1 AND 31);
ALTER TABLE public.month_sources ADD COLUMN closing_day integer NOT NULL DEFAULT 1 CHECK (closing_day BETWEEN 1 AND 31);

-- Competence month ("YYYY-MM") of a moment for a source whose cycle starts on p_closing.
-- The cycle is named after the month in which it starts; days past the month's end clamp to its last day.
CREATE OR REPLACE FUNCTION public.competence_ym(p_at timestamptz, p_closing integer)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_local timestamp := coalesce(p_at, now()) AT TIME ZONE 'America/Sao_Paulo';
  v_first date := date_trunc('month', v_local)::date;
  v_last int := extract(day FROM (v_first + interval '1 month' - interval '1 day'))::int;
  v_start int := least(greatest(coalesce(p_closing, 1), 1), v_last);
BEGIN
  IF extract(day FROM v_local)::int >= v_start THEN
    RETURN to_char(v_first, 'YYYY-MM');
  END IF;
  RETURN to_char(v_first - interval '1 month', 'YYYY-MM');
END $$;

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
  INSERT INTO month_sources(month_id, source_id, name, budget, position, closing_day)
    SELECT v_id, s.id, s.name, s.default_amount, s.position, s.closing_day FROM sources s
    WHERE s.household_id = p_household AND s.active
    ON CONFLICT DO NOTHING;
  RETURN v_id;
END $$;

-- Month a receipt belongs to: the source's cycle that contains the emission date.
CREATE OR REPLACE FUNCTION public.receipt_month(p_household uuid, p_source uuid, p_issued_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_closing int; v_month uuid;
BEGIN
  SELECT closing_day INTO v_closing FROM sources WHERE id = p_source AND household_id = p_household;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fonte inválida'; END IF;
  v_month := ensure_month(p_household, competence_ym(p_issued_at, v_closing));
  INSERT INTO month_sources(month_id, source_id, name, budget, position, closing_day)
    SELECT v_month, s.id, s.name, 0, s.position, s.closing_day FROM sources s WHERE s.id = p_source
    ON CONFLICT (month_id, source_id) DO NOTHING;
  RETURN v_month;
END $$;

CREATE OR REPLACE FUNCTION public.receipts_assign_month()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.month_id := receipt_month(NEW.household_id, NEW.source_id, NEW.issued_at);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS receipts_assign_month ON public.receipts;
CREATE TRIGGER receipts_assign_month
  BEFORE INSERT OR UPDATE OF source_id, issued_at ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.receipts_assign_month();

-- Each active source's running cycle right now (months are created on demand).
CREATE OR REPLACE FUNCTION public.ensure_current_cycles(p_household uuid)
RETURNS TABLE(source_id uuid, month_id uuid, year_month text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v_ym text; v_month uuid;
BEGIN
  IF NOT is_household_member(p_household) THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR s IN SELECT * FROM sources WHERE household_id = p_household AND active ORDER BY position LOOP
    v_ym := competence_ym(now(), s.closing_day);
    v_month := ensure_month(p_household, v_ym);
    INSERT INTO month_sources(month_id, source_id, name, budget, position, closing_day)
      VALUES (v_month, s.id, s.name, s.default_amount, s.position, s.closing_day)
      ON CONFLICT ON CONSTRAINT month_sources_month_id_source_id_key DO NOTHING;
    source_id := s.id; month_id := v_month; year_month := v_ym;
    RETURN NEXT;
  END LOOP;
END $$;

-- After editing defaults: make sure each source has its running cycle, copy names/order/closing day
-- to running and future cycles, always refresh budgets of cycles that have not started,
-- and refresh the running cycle's budget only when asked.
CREATE OR REPLACE FUNCTION public.sync_current_month(p_household uuid, p_update_budgets boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v_ym text;
BEGIN
  IF NOT is_household_member(p_household) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM ensure_current_cycles(p_household);
  FOR s IN SELECT * FROM sources WHERE household_id = p_household LOOP
    v_ym := competence_ym(now(), s.closing_day);
    UPDATE month_sources ms SET
      name = s.name,
      position = s.position,
      closing_day = s.closing_day,
      budget = CASE WHEN m.year_month > v_ym OR p_update_budgets THEN s.default_amount ELSE ms.budget END
    FROM months m
    WHERE ms.month_id = m.id AND m.household_id = p_household AND ms.source_id = s.id AND m.year_month >= v_ym;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.add_receipt(
  p_household uuid, p_source uuid, p_access_key text, p_store_name text, p_store_cnpj text,
  p_store_address text, p_issued_at timestamptz, p_total numeric, p_qr_url text, p_origin text, p_items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_month uuid; v_id uuid; v_name text;
BEGIN
  IF NOT is_household_member(p_household) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sources WHERE id = p_source AND household_id = p_household) THEN
    RAISE EXCEPTION 'Fonte inválida';
  END IF;
  IF p_total IS NULL OR p_total < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF nullif(p_access_key, '') IS NOT NULL AND EXISTS (SELECT 1 FROM receipts WHERE household_id = p_household AND access_key = p_access_key) THEN
    RAISE EXCEPTION 'Essa nota já foi lançada';
  END IF;
  v_month := receipt_month(p_household, p_source, coalesce(p_issued_at, now()));
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

REVOKE EXECUTE ON FUNCTION public.receipt_month(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.receipts_assign_month() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_current_cycles(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_cycles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.competence_ym(timestamptz, integer) TO authenticated;