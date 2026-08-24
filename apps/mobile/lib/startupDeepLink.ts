export type StartupRouteCandidate =
  | 'agreement-signup'
  | 'agreement-tabs'
  | 'agreement-onboarding'
  | 'signup'
  | 'onboarding'
  | 'tabs'
  | 'password-reset'
  | 'game-link';

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

/**
 * Keep a pending shared-game URL from being overwritten by the default tabs
 * landing route during auth/startup races. Never upgrade terms/auth gates.
 */
export function resolveStartupRoute(
  requestedRoute: StartupRouteCandidate,
  currentRoute: StartupRouteCandidate | null,
  hasPendingGameLink: boolean,
): StartupRouteCandidate {
  if (requestedRoute === 'game-link') {
    return 'game-link';
  }

  if (requestedRoute === 'tabs' && hasPendingGameLink) {
    return 'game-link';
  }

  if (currentRoute === 'game-link' && requestedRoute === 'tabs') {
    return 'game-link';
  }

  // Auth/terms gates must replace a premature tabs choice from SIGNED_IN races.
  if (
    requestedRoute === 'agreement-tabs' ||
    requestedRoute === 'agreement-onboarding' ||
    requestedRoute === 'agreement-signup' ||
    requestedRoute === 'signup' ||
    requestedRoute === 'password-reset'
  ) {
    return requestedRoute;
  }

  return currentRoute ?? requestedRoute;
}

function gamePathFromSegments(segments: string[], search: string): string | null {
  if (segments.length !== 2 || segments[0].toLowerCase() !== 'g') {
    return null;
  }

  const publicId = segments[1];
  if (!publicId) {
    return null;
  }

  return search ? `/g/${publicId}${search}` : `/g/${publicId}`;
}

function messagePathFromSegments(segments: string[], search: string): string | null {
  if (
    segments.length !== 2 ||
    segments[0].toLowerCase() !== 'open' ||
    segments[1].toLowerCase() !== 'message'
  ) {
    return null;
  }

  return search ? `/open/message${search}` : '/open/message';
}

function pathFromSportinerUrl(
  url: string,
  fromSegments: (segments: string[], search: string) => string | null,
): string | null {
  try {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol.toLowerCase();
    const hostname = parsedUrl.hostname.toLowerCase();
    const segments = pathSegments(parsedUrl.pathname);
    const search = parsedUrl.search || '';

    if (protocol === 'sportiner:') {
      const customSchemeSegments = [hostname, ...segments].filter(Boolean);
      return fromSegments(customSchemeSegments, search);
    }

    if (
      protocol === 'https:' &&
      (hostname === 'sportiner.com' || hostname === 'www.sportiner.com')
    ) {
      return fromSegments(segments, search);
    }

    return null;
  } catch {
    return null;
  }
}

export function isGameDeepLinkUrl(url: string | null): boolean {
  return gameDeepLinkPath(url) !== null;
}

/**
 * Normalize an incoming Sportiner game URL into an Expo Router path.
 * Preserves a malformed public id so /g/[id] can show the invalid-link state.
 */
export function gameDeepLinkPath(url: string | null): string | null {
  if (!url) return null;
  return pathFromSportinerUrl(url, gamePathFromSegments);
}

/**
 * Normalize an incoming Sportiner message URL into an Expo Router path.
 * Query params (chatId, messageId) are preserved so /open/message can
 * route into the conversation and scroll to that message.
 */
export function messageDeepLinkPath(url: string | null): string | null {
  if (!url) return null;
  return pathFromSportinerUrl(url, messagePathFromSegments);
}

export function inboundDeepLinkPath(url: string | null): string | null {
  return gameDeepLinkPath(url) ?? messageDeepLinkPath(url);
}
