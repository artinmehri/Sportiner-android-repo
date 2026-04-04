export type GameMeta = {
  gameType: '1v1' | 'Group';
  joinSetting: '👥 Open to Anyone' | '✋ Request Approval';
  courtType: 'Public' | 'Private/Club' | 'Condo';
  isBooked: boolean;
  isPaid: boolean;
  paymentAmount?: string;
  location: string;
};

const META_PREFIX = '\n\n<!--sportiner-meta:';
const META_SUFFIX = '-->';

export function appendGameMeta(description: string, meta: GameMeta): string {
  const base = description.trimEnd();
  const json = JSON.stringify(meta);
  return `${base}${META_PREFIX}${json}${META_SUFFIX}`;
}

export function parseGameMeta(description: string | null): {
  cleanDescription: string;
  meta: GameMeta | null;
} {
  if (!description) {
    return { cleanDescription: '', meta: null };
  }
  const idx = description.lastIndexOf(META_PREFIX);
  if (idx === -1) {
    return { cleanDescription: description, meta: null };
  }
  const end = description.indexOf(META_SUFFIX, idx);
  if (end === -1) {
    return { cleanDescription: description, meta: null };
  }
  try {
    const meta = JSON.parse(description.slice(idx + META_PREFIX.length, end)) as GameMeta;
    const cleanDescription = description.slice(0, idx).trimEnd();
    return { cleanDescription, meta };
  } catch {
    return { cleanDescription: description, meta: null };
  }
}

export function combineDateAndTimeToIso(dateIso: string, timeStr: string): string {
  const d = new Date(dateIso);
  const [hRaw, mRaw] = timeStr.split(':');
  const h = parseInt(hRaw ?? '0', 10);
  const m = parseInt(mRaw ?? '0', 10);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d.toISOString();
}
