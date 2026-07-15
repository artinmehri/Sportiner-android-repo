export type OnboardingProvider = 'email' | 'google' | 'apple' | 'unknown';

export type OnboardingFailure =
  | 'account_creation'
  | 'account_exists'
  | 'email_confirmation'
  | 'session'
  | 'profile_save'
  | 'terms_save'
  | 'location'
  | 'nearby_games'
  | 'game_join'
  | 'already_joined'
  | 'already_requested'
  | 'game_full'
  | 'game_unavailable'
  | 'configuration'
  | 'network';

export type OnboardingErrorContext = {
  failure: OnboardingFailure;
  provider?: OnboardingProvider;
  source: string;
};

type ErrorDetails = {
  code?: string;
  status?: string | number;
  message?: string;
};

export class OnboardingFlowError extends Error {
  readonly failure: OnboardingFailure;
  readonly provider: OnboardingProvider;
  readonly source: string;
  readonly backendCode?: string;
  readonly backendStatus?: string | number;
  readonly backendMessage?: string;

  constructor(context: OnboardingErrorContext, details: ErrorDetails = {}) {
    super(details.message ?? context.failure);
    this.name = 'OnboardingFlowError';
    this.failure = context.failure;
    this.provider = context.provider ?? 'unknown';
    this.source = context.source;
    this.backendCode = details.code;
    this.backendStatus = details.status;
    this.backendMessage = details.message;
  }
}

function readErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof OnboardingFlowError) {
    return {
      code: error.backendCode,
      status: error.backendStatus,
      message: error.backendMessage ?? error.message,
    };
  }

  if (error instanceof Error) {
    const value = error as Error & { code?: unknown; status?: unknown };
    return {
      code: typeof value.code === 'string' ? value.code : undefined,
      status:
        typeof value.status === 'string' || typeof value.status === 'number'
          ? value.status
          : undefined,
      message: error.message,
    };
  }

  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    return {
      code: typeof value.code === 'string' ? value.code : undefined,
      status:
        typeof value.status === 'string' || typeof value.status === 'number'
          ? value.status
          : undefined,
      message: typeof value.message === 'string' ? value.message : undefined,
    };
  }

  return { message: typeof error === 'string' ? error : undefined };
}

function isNetworkFailure(details: ErrorDetails): boolean {
  const message = details.message?.toLowerCase() ?? '';
  const status = Number(details.status);

  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('internet connection') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    status === 0 ||
    status >= 500
  );
}

function classifyFailure(
  fallback: OnboardingFailure,
  details: ErrorDetails
): OnboardingFailure {
  if (isNetworkFailure(details)) {
    return 'network';
  }

  const message = details.message?.toLowerCase() ?? '';

  if (fallback === 'account_creation') {
    if (message.includes('email not confirmed') || message.includes('email confirmation')) {
      return 'email_confirmation';
    }

    if (
      message.includes('already registered') ||
      message.includes('already exists') ||
      message.includes('user already')
    ) {
      return 'account_exists';
    }
  }

  if (fallback === 'game_join' && details.code === '23505') {
    return 'already_joined';
  }

  return fallback;
}

export function toOnboardingError(
  context: OnboardingErrorContext,
  error?: unknown
): OnboardingFlowError {
  if (error instanceof OnboardingFlowError) {
    return error;
  }

  const details = readErrorDetails(error);
  return new OnboardingFlowError(
    {
      ...context,
      failure: classifyFailure(context.failure, details),
    },
    details
  );
}

export function logOnboardingError(
  error: OnboardingFlowError,
  metadata?: Record<string, string | number | boolean | null | undefined>
) {
  // Log only operational fields; never pass credentials, tokens, email
  // addresses, profile payloads, or the original error object here.
  console.error('[onboarding-error]', {
    source: error.source,
    failure: error.failure,
    provider: error.provider,
    code: error.backendCode,
    status: error.backendStatus,
    backendMessage: error.backendMessage?.slice(0, 500),
    ...metadata,
  });
}

export function onboardingErrorCopy(error: OnboardingFlowError): {
  title: string;
  message: string;
} {
  switch (error.failure) {
    case 'network':
      return { title: 'Connection problem', message: 'Check your internet connection and try again.' };
    case 'account_exists':
      return {
        title: 'Account already exists',
        message: 'This email is already registered. Log in instead, or try the original password.',
      };
    case 'email_confirmation':
      return {
        title: 'Confirm your email',
        message: 'Confirm the link in your email, then return to Sportiner and try again.',
      };
    case 'account_creation':
      return {
        title: 'Account creation',
        message: 'We couldn’t create your account. Please check your information and try again.',
      };
    case 'session':
      return {
        title: 'Account not ready',
        message: 'Your account session isn’t ready yet. Please try again.',
      };
    case 'profile_save':
      return {
        title: 'Profile not saved',
        message: 'Your account was created, but we couldn’t save your profile yet. Please try again.',
      };
    case 'terms_save':
      return {
        title: 'Agreement not saved',
        message: 'We couldn’t save your agreement yet. Please try again.',
      };
    case 'location':
      return {
        title: 'Location unavailable',
        message: 'We couldn’t get your location. Try again or continue without it.',
      };
    case 'nearby_games':
      return { title: 'Games unavailable', message: 'We couldn’t load nearby games. Please try again.' };
    case 'already_joined':
      return { title: 'Already joined', message: 'You’re already in this game.' };
    case 'already_requested':
      return { title: 'Request already sent', message: 'You already requested a spot in this game.' };
    case 'game_full':
      return { title: 'Game full', message: 'This game is full. Choose another game.' };
    case 'game_unavailable':
      return { title: 'Game unavailable', message: 'This game is no longer available.' };
    case 'configuration':
      return {
        title: 'Service unavailable',
        message: 'Game joining is unavailable right now. Please try again later.',
      };
    case 'game_join':
    default:
      return {
        title: 'Couldn’t join game',
        message: 'Your account is ready, but we couldn’t join this game. Please try again.',
      };
  }
}

export function providerFromMethod(method: unknown): OnboardingProvider {
  if (method === 'email' || method === 'google' || method === 'apple') {
    return method;
  }
  return 'unknown';
}
