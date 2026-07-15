import AsyncStorage from '@react-native-async-storage/async-storage';

import { CURRENT_TERMS_VERSION } from '@/constants/legal';
import { supabase } from '@/context/AuthContext';

const TERMS_ACCEPTANCE_KEY = 'sportiner_terms_acceptance';
const LEGACY_TERMS_ACCEPTED_KEY = 'sportiner_terms_seen';

type LocalTermsAcceptance = {
  version: string;
  acceptedAt: string;
  userId: string | null;
};

function isMissingTermsMetadataColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === '42703' ||
    message.includes('accepted_terms_version') ||
    message.includes('accepted_terms_at')
  );
}

function isCurrentAcceptance(value: unknown): value is LocalTermsAcceptance {
  if (!value || typeof value !== 'object') return false;

  const record = value as Partial<LocalTermsAcceptance>;
  return (
    record.version === CURRENT_TERMS_VERSION &&
    typeof record.acceptedAt === 'string' &&
    (typeof record.userId === 'string' || record.userId === null)
  );
}

async function saveLocalAcceptance(record: LocalTermsAcceptance) {
  await AsyncStorage.setItem(TERMS_ACCEPTANCE_KEY, JSON.stringify(record));
  await AsyncStorage.removeItem(LEGACY_TERMS_ACCEPTED_KEY);
}

export async function getLocalTermsAcceptance(): Promise<LocalTermsAcceptance | null> {
  try {
    const rawValue = await AsyncStorage.getItem(TERMS_ACCEPTANCE_KEY);

    if (rawValue) {
      const parsed = JSON.parse(rawValue) as unknown;
      return isCurrentAcceptance(parsed) ? parsed : null;
    }

    // Preserve an acceptance made by an older build, then immediately migrate it
    // to the versioned format so future terms updates can require re-acceptance.
    const legacyValue = await AsyncStorage.getItem(LEGACY_TERMS_ACCEPTED_KEY);
    if (legacyValue === 'true') {
      const migratedRecord: LocalTermsAcceptance = {
        version: CURRENT_TERMS_VERSION,
        acceptedAt: new Date().toISOString(),
        userId: null,
      };
      await saveLocalAcceptance(migratedRecord);
      return migratedRecord;
    }
  } catch (error) {
    console.warn('Unable to restore terms acceptance:', error);
  }

  return null;
}

export async function hasCurrentLocalTermsAcceptance(): Promise<boolean> {
  return (await getLocalTermsAcceptance()) !== null;
}

export async function hasUnboundLocalTermsAcceptance(): Promise<boolean> {
  const acceptance = await getLocalTermsAcceptance();
  return Boolean(acceptance && acceptance.userId === null);
}

export async function hasLocalTermsAcceptanceForUser(userId: string): Promise<boolean> {
  const acceptance = await getLocalTermsAcceptance();
  return Boolean(acceptance && (acceptance.userId === null || acceptance.userId === userId));
}

export async function acceptTermsLocally(userId: string | null = null) {
  const acceptance: LocalTermsAcceptance = {
    version: CURRENT_TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
    userId,
  };

  await saveLocalAcceptance(acceptance);
  return acceptance;
}

export async function bindLocalTermsAcceptanceToUser(userId: string): Promise<boolean> {
  const acceptance = await getLocalTermsAcceptance();

  if (!acceptance || (acceptance.userId && acceptance.userId !== userId)) {
    return false;
  }

  if (acceptance.userId === null) {
    await saveLocalAcceptance({ ...acceptance, userId });
  }

  return true;
}

export async function userHasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const versionedResult = await supabase
    .from('users')
    .select('accepted_terms, accepted_terms_version')
    .eq('id', userId)
    .maybeSingle();

  if (!versionedResult.error) {
    if (versionedResult.data?.accepted_terms !== true) return false;

    if (versionedResult.data.accepted_terms_version === CURRENT_TERMS_VERSION) {
      return true;
    }

    // Backfill users accepted by an older app build after the columns existed.
    if (!versionedResult.data.accepted_terms_version) {
      return persistTermsAcceptanceForUser(userId);
    }

    return false;
  }

  if (!isMissingTermsMetadataColumn(versionedResult.error)) {
    console.warn('Unable to check accepted terms:', versionedResult.error.message);
    return false;
  }

  // Compatibility fallback while the metadata migration is being deployed.
  const legacyResult = await supabase
    .from('users')
    .select('accepted_terms')
    .eq('id', userId)
    .maybeSingle();

  if (legacyResult.error) {
    console.warn('Unable to check accepted terms:', legacyResult.error.message);
    return false;
  }

  return legacyResult.data?.accepted_terms === true;
}

export function currentTermsProfileFields(acceptedAt = new Date().toISOString()) {
  return {
    accepted_terms: true,
    accepted_terms_at: acceptedAt,
    accepted_terms_version: CURRENT_TERMS_VERSION,
  };
}

export async function persistTermsAcceptanceForUser(userId: string): Promise<boolean> {
  const localAcceptance = await getLocalTermsAcceptance();
  const acceptedAt =
    localAcceptance && (!localAcceptance.userId || localAcceptance.userId === userId)
      ? localAcceptance.acceptedAt
      : new Date().toISOString();

  const versionedResult = await supabase
    .from('users')
    .update(currentTermsProfileFields(acceptedAt))
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (!versionedResult.error) {
    if (!versionedResult.data) return false;
    await acceptTermsLocally(userId);
    return true;
  }

  if (!isMissingTermsMetadataColumn(versionedResult.error)) {
    console.warn('Unable to save accepted terms:', versionedResult.error.message);
    return false;
  }

  const legacyResult = await supabase
    .from('users')
    .update({ accepted_terms: true })
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (legacyResult.error || !legacyResult.data) {
    console.warn('Unable to save accepted terms:', legacyResult.error?.message);
    return false;
  }

  await acceptTermsLocally(userId);
  return true;
}
