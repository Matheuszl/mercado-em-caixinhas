CREATE TABLE public.receipt_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.sources(id),
  month_id uuid NOT NULL REFERENCES public.months(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (receipt_id, source_id)
);
CREATE INDEX receipt_splits_month_idx ON public.receipt_splits(month_id);

GRANT SELECT ON public.receipt_splits TO authenticated;
GRANT ALL ON public.receipt_splits TO service_role;
ALTER TABLE public.receipt_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read splits" ON public.receipt_splits FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

INSERT INTO public.receipt_splits(receipt_id, household_id, source_id, month_id, amount)
  SELECT id, household_id, source_id, month_id, total FROM public.receipts;

-- Replace a receipt's splits; amounts must add up to the total. The receipt's main source is the largest share.
CREATE OR REPLACE FUNCTION public.set_receipt_splits(p_receipt uuid, p_splits jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_sum numeric; v_main uuid; e jsonb;
BEGIN
  SELECT * INTO r FROM receipts WHERE id = p_receipt;
  IF NOT FOUND OR NOT is_household_member(r.household_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_splits IS NULL OR jsonb_array_length(p_splits) = 0 THEN RAISE EXCEPTION 'Escolha pelo menos uma fonte'; END IF;
  SELECT coalesce(sum(round((x->>'amount')::numeric, 2)), 0) INTO v_sum FROM jsonb_array_elements(p_splits) x;
  IF v_sum <> round(r.total, 2) THEN RAISE EXCEPTION 'A divisão precisa somar o total da nota'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_splits) x WHERE (x->>'amount')::numeric < 0
             OR NOT EXISTS (SELECT 1 FROM sources s WHERE s.id = (x->>'source_id')::uuid AND s.household_id = r.household_id)) THEN
    RAISE EXCEPTION 'Divisão inválida';
  END IF;
  DELETE FROM receipt_splits WHERE receipt_id = p_receipt;
  FOR e IN SELECT x FROM jsonb_array_elements(p_splits) x WHERE round((x->>'amount')::numeric, 2) > 0 OR jsonb_array_length(p_splits) = 1 LOOP
    INSERT INTO receipt_splits(receipt_id, household_id, source_id, month_id, amount)
    VALUES (p_receipt, r.household_id, (e->>'source_id')::uuid,
            receipt_month(r.household_id, (e->>'source_id')::uuid, r.issued_at), round((e->>'amount')::numeric, 2));
  END LOOP;
  SELECT source_id INTO v_main FROM receipt_splits WHERE receipt_id = p_receipt ORDER BY amount DESC LIMIT 1;
  IF v_main IS NOT NULL AND v_main <> r.source_id THEN
    UPDATE receipts SET source_id = v_main WHERE id = p_receipt;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.add_receipt(uuid, uuid, text, text, text, text, timestamptz, numeric, text, text, jsonb);
CREATE FUNCTION public.add_receipt(
  p_household uuid, p_source uuid, p_access_key text, p_store_name text, p_store_cnpj text,
  p_store_address text, p_issued_at timestamptz, p_total numeric, p_qr_url text, p_origin text, p_items jsonb,
  p_splits jsonb DEFAULT NULL
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
  PERFORM set_receipt_splits(v_id, coalesce(p_splits,
    jsonb_build_array(jsonb_build_object('source_id', p_source, 'amount', round(p_total, 2)))));
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_receipt_splits(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_receipt_splits(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.add_receipt(uuid, uuid, text, text, text, text, timestamptz, numeric, text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_receipt(uuid, uuid, text, text, text, text, timestamptz, numeric, text, text, jsonb, jsonb) TO authenticated;