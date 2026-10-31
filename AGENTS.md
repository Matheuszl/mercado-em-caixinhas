<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Data is shared per household: every table is scoped by `household_id` and RLS uses `is_household_member()`; users join a household with its invite code (`create_household` / `join_household` RPCs). Why: two people must see the same data without exposing it to any other signed-in Google account.
- A month is a row in `months` keyed by `YYYY-MM` (São Paulo time) and snapshots each source's budget into `month_sources` when created (`ensure_month`). Why: changing default amounts must not rewrite closed months.
- Receipts are saved only through the `add_receipt` RPC, which picks the month from the emission date and inserts items atomically. Why: keeps month assignment and duplicate-key checks in one place.
- Balance math lives in `src/lib/budget.ts` (integer cents) and is covered by tests. Why: UI and history must agree on positive/negative results.
- NFC-e lookup runs server-side in `src/lib/nfce.functions.ts` (SEFAZ pages block browser CORS); HTML parsing is pure in `src/lib/nfce-parse.ts` with tests. Only Rio Grande do Sul (SVRS portal) is supported.
- Signed-in pages live under `src/routes/_authenticated/_app/`, whose layout loads the household (or shows onboarding) and provides it via `useHousehold()`.
