export function isUpcomingGameTime(
  value: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!value) return false;

  const gameTime = Date.parse(value);
  return Number.isFinite(gameTime) && gameTime >= now.getTime();
}

export function combineLocalDateAndTime(
  dateValue: string,
  timeValue: string
): string | null {
  const date = new Date(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);

  if (!Number.isFinite(date.getTime()) || !timeMatch) return null;

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59) return null;

  const localGameTime = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0
  );

  return localGameTime.toISOString();
}
