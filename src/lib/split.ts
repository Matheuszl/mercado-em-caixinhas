/** Splitting a receipt between sources, in integer cents. */
export type SplitMap = Record<string, number>; // source id -> cents

/** Everything on one source. */
export function allTo(sourceId: string, totalC: number): SplitMap {
  return { [sourceId]: totalC };
}

/** Equal shares; leftover cents go to the first sources. */
export function evenSplit(ids: string[], totalC: number): SplitMap {
  const base = Math.floor(totalC / ids.length);
  let extra = totalC - base * ids.length;
  const out: SplitMap = {};
  for (const id of ids) {
    out[id] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
  return out;
}

/**
 * Set one source's amount and let the rest fall on another source automatically
 * (the last one in the list, or the first when editing the last). Clamped to [0, total].
 */
export function setShare(ids: string[], current: SplitMap, editedId: string, valueC: number, totalC: number): SplitMap {
  const restId = (ids[ids.length - 1] === editedId ? ids[0] : ids[ids.length - 1]) ?? editedId;
  const others = ids.filter((id) => id !== editedId && id !== restId);
  const fixedC = others.reduce((acc, id) => acc + (current[id] ?? 0), 0);
  const v = Math.max(0, Math.min(valueC, totalC - fixedC));
  const out: SplitMap = {};
  for (const id of ids) out[id] = current[id] ?? 0;
  out[editedId] = v;
  if (restId !== editedId) out[restId] = totalC - fixedC - v;
  return out;
}

export function splitSum(split: SplitMap): number {
  return Object.values(split).reduce((a, b) => a + b, 0);
}
