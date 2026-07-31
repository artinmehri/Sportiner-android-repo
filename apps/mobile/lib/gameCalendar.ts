import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

const DEFAULT_GAME_DURATION_MS = 2 * 60 * 60 * 1000;

export type AddGameToCalendarInput = {
  gameId: string;
  title: string;
  startDate: string | Date;
  location?: string | null;
  notes?: string | null;
};

export type AddGameToCalendarResult =
  | { ok: true; eventId: string }
  | {
      ok: false;
      reason:
        | 'calendar_unavailable'
        | 'invalid_date'
        | 'permission_denied'
        | 'no_writable_calendar'
        | 'create_failed';
      error?: unknown;
    };

async function getWritableEventCalendar(): Promise<Calendar.Calendar | null> {
  if (Platform.OS === 'ios') {
    try {
      const defaultCalendar = await Calendar.getDefaultCalendarAsync();

      if (defaultCalendar.allowsModifications) {
        return defaultCalendar;
      }
    } catch (error) {
      console.warn('[calendar] Unable to read the default iOS calendar', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writableCalendars = calendars.filter(
    (calendar) => calendar.allowsModifications
  );

  return (
    writableCalendars.find((calendar) => calendar.isPrimary) ??
    writableCalendars.find((calendar) => calendar.source?.isLocalAccount) ??
    writableCalendars[0] ??
    null
  );
}

export async function addGameToCalendar({
  gameId,
  title,
  startDate,
  location,
  notes,
}: AddGameToCalendarInput): Promise<AddGameToCalendarResult> {
  const parsedStartDate =
    startDate instanceof Date
      ? new Date(startDate.getTime())
      : new Date(startDate);

  if (!Number.isFinite(parsedStartDate.getTime())) {
    return { ok: false, reason: 'invalid_date' };
  }

  try {
    const isAvailable = await Calendar.isAvailableAsync();

    if (!isAvailable) {
      return { ok: false, reason: 'calendar_unavailable' };
    }

    const permission = await Calendar.requestCalendarPermissionsAsync();

    if (permission.status !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }

    const calendar = await getWritableEventCalendar();

    if (!calendar) {
      return { ok: false, reason: 'no_writable_calendar' };
    }

    const eventId = await Calendar.createEventAsync(calendar.id, {
      title: title.trim() || 'Sportiner game',
      startDate: parsedStartDate,
      endDate: new Date(parsedStartDate.getTime() + DEFAULT_GAME_DURATION_MS),
      location: location?.trim() || undefined,
      notes: notes?.trim() || undefined,
      alarms: [{ relativeOffset: -10 }],
    });

    return { ok: true, eventId };
  } catch (error) {
    console.error('[calendar] Failed to add game', {
      gameId,
      message: error instanceof Error ? error.message : String(error),
    });

    return { ok: false, reason: 'create_failed', error };
  }
}

export function getAddToCalendarErrorMessage(
  reason: Exclude<AddGameToCalendarResult, { ok: true }>['reason']
): { title: string; message: string } {
  switch (reason) {
    case 'invalid_date':
      return {
        title: 'Invalid game date',
        message: 'This game does not have a valid start time.',
      };
    case 'permission_denied':
      return {
        title: 'Calendar access needed',
        message: 'Enable calendar access for Sportiner in Settings, then try again.',
      };
    case 'calendar_unavailable':
      return {
        title: 'Calendar unavailable',
        message: 'Calendar is not available on this device.',
      };
    case 'no_writable_calendar':
      return {
        title: 'No writable calendar',
        message: 'Add or enable a calendar that allows new events, then try again.',
      };
    case 'create_failed':
      return {
        title: 'Could not add event',
        message: 'The event could not be added to your calendar. Please try again.',
      };
  }
}
