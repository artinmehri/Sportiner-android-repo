import * as AppleAuthentication from 'expo-apple-authentication';

import { supabase } from '@/context/AuthContext';

export const APPLE_REAUTH_REQUIRED = 'APPLE_REAUTH_REQUIRED';

type DeleteResult = {
  data: any;
  error: any;
};

async function errorCode(result: DeleteResult): Promise<string | null> {
  if (typeof result.data?.code === 'string') return result.data.code;

  const response = result.error?.context;
  if (!response || typeof response.clone !== 'function') return null;

  const body = await response.clone().json().catch(() => null);
  return typeof body?.code === 'string' ? body.code : null;
}

export async function storeAppleAuthorizationCode(authorizationCode: string | null) {
  if (!authorizationCode) {
    throw new Error('Apple did not return an authorization code');
  }

  const { data, error } = await supabase.functions.invoke('apple-token-exchange', {
    body: { authorizationCode },
  });

  if (error || data?.stored !== true) {
    throw new Error('Unable to prepare this Apple account for secure deletion');
  }
}

export async function runAppleAwareDelete(
  invokeDelete: () => Promise<DeleteResult>,
  reauthenticate: () => Promise<void>,
) {
  let result = await invokeDelete();
  if (await errorCode(result) !== APPLE_REAUTH_REQUIRED) return result;

  await reauthenticate();
  result = await invokeDelete();
  return result;
}

export async function deleteAccountWithAppleReauth() {
  return runAppleAwareDelete(
    () => supabase.functions.invoke('delete-user', { body: {} }),
    async () => {
      const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
      await storeAppleAuthorizationCode(credential.authorizationCode);
    },
  );
}
