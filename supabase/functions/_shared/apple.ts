import {
  SignJWT,
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
} from "npm:jose@6"

const APPLE_ISSUER = "https://appleid.apple.com"
const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`
const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`
const appleJwks = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`))

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function createAppleClientSecret() {
  const clientId = requiredEnv("APPLE_CLIENT_ID")
  const teamId = requiredEnv("APPLE_TEAM_ID")
  const keyId = requiredEnv("APPLE_KEY_ID")
  const privateKey = requiredEnv("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n")
  const signingKey = await importPKCS8(privateKey, "ES256")

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey)
}

async function appleRequest(url: string, params: URLSearchParams) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  return response
}

export async function exchangeAppleAuthorizationCode(authorizationCode: string) {
  const clientId = requiredEnv("APPLE_CLIENT_ID")
  const response = await appleRequest(
    APPLE_TOKEN_URL,
    new URLSearchParams({
      client_id: clientId,
      client_secret: await createAppleClientSecret(),
      code: authorizationCode,
      grant_type: "authorization_code",
    }),
  )
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>

  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : "unknown_error"
    throw new Error(`Apple authorization-code exchange failed: ${code}`)
  }

  if (typeof payload.refresh_token !== "string" || typeof payload.id_token !== "string") {
    throw new Error("Apple authorization-code exchange did not return the required tokens")
  }

  return {
    refreshToken: payload.refresh_token,
    identityToken: payload.id_token,
  }
}

export async function verifyAppleIdentityToken(identityToken: string, expectedSubject: string) {
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: requiredEnv("APPLE_CLIENT_ID"),
  })

  if (payload.sub !== expectedSubject) {
    throw new Error("Apple identity does not match the authenticated user")
  }
}

export async function revokeAppleRefreshToken(refreshToken: string) {
  const response = await appleRequest(
    APPLE_REVOKE_URL,
    new URLSearchParams({
      client_id: requiredEnv("APPLE_CLIENT_ID"),
      client_secret: await createAppleClientSecret(),
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
  )

  if (!response.ok) {
    throw new Error(`Apple token revocation failed with status ${response.status}`)
  }
}
