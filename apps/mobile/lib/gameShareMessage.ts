export type GameShareMessageInput = {
  gameType: '1v1' | 'Group';
  startsAt?: string | null;
  location?: string | null;
  level?: string | null;
  spotsLeft: number;
};

export function getGameShareSpotsLeft(capacity: number, playersEnrolled: number): number {
  const spotsLeft = Math.floor(capacity - playersEnrolled);
  return Number.isFinite(spotsLeft) && spotsLeft > 0 ? spotsLeft : 0;
}

function formatSchedule(startsAt: string | null | undefined): string {
  if (!startsAt) return '';

  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return '';

  const day = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day} at ${time}`;
}

export function buildGameShareMessage(
  input: GameShareMessageInput,
  random: () => number = Math.random,
): string {
  const place = input.location?.trim() ?? '';
  const schedule = formatSchedule(input.startsAt);
  const level = input.level?.trim() ?? '';
  const levelTennis = level ? `${level} tennis` : 'Tennis';
  const levelPrefix = level ? `${level.toLowerCase()} ` : '';
  const openSpots = input.spotsLeft === 1
    ? `there's 1 spot open if you want to play`
    : `there are ${input.spotsLeft} spots open if you want to play`;

  const templates = input.gameType === '1v1'
    ? [
        `Hey! I'm looking for someone to play tennis. Wanna join me? 🎾`,
        `Anyone down for tennis? I need one more player 🎾`,
        `I've got a tennis game planned and I'm looking for someone to hit with. Interested?`,
        `${levelTennis}. Looking for one person to play, you in? 🎾`,
        `Want to play tennis? I'm setting up a 1-on-1 and thought you might be up for it 🎾`,
      ]
    : [
        `We're getting a group together for ${levelPrefix}tennis 🎾 Come join us if you're down!`,
        `Tennis 👀 We've got a group game going and ${openSpots}.`,
        `We've got a tennis group playing. Want in? 🎾`,
        `${levelTennis}. We're filling the remaining spots. Come play if you're free!`,
        `There's a group tennis game happening. If that sounds fun, grab a spot 🎾`,
      ];

  const hook = templates[Math.floor(random() * templates.length)] ?? templates[0];
  return [hook, place, schedule].filter(Boolean).join('\n');
}
