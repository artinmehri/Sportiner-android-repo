import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import {
  exchangeAppleAuthorizationCode,
  verifyAppleIdentityToken,
} from "../_shared/apple.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://prswdcjmowfdvalyutlu.supabase.co"
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
  if (!supabaseServiceKey) return json({ error: "Apple credential storage is unavailable" }, 500)

  try {
    const accessToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")
    if (!accessToken) return json({ error: "Missing authorization header" }, 401)

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
    if (authError || !user) return json({ error: "Invalid or expired token" }, 401)

    const body = await req.json().catch(() => ({}))
    const authorizationCode = typeof body?.authorizationCode === "string"
      ? body.authorizationCode.trim()
      : ""
    if (!authorizationCode || authorizationCode.length > 4096) {
      return json({ error: "A valid Apple authorization code is required" }, 400)
    }

    const appleIdentity = user.identities?.find((identity) => identity.provider === "apple")
    const appleSubject = appleIdentity?.identity_data?.sub
    if (typeof appleSubject !== "string" || !appleSubject) {
      return json({ error: "The authenticated account is not a Sign in with Apple account" }, 403)
    }

    const { refreshToken, identityToken } = await exchangeAppleAuthorizationCode(authorizationCode)
    await verifyAppleIdentityToken(identityToken, appleSubject)

    const { error: storeError } = await supabase.rpc("store_apple_refresh_token_v1", {
      p_user_id: user.id,
      p_refresh_token: refreshToken,
    })
    if (storeError) throw new Error(`Apple credential storage failed: ${storeError.message}`)

    const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        apple_revocation_status: "active",
      },
    })
    if (metadataError) {
      throw new Error(`Apple credential status update failed: ${metadataError.message}`)
    }

    return json({ stored: true })
  } catch (error) {
    console.error("apple-token-exchange failed", error instanceof Error ? error.message : error)
    return json({ error: "Unable to store the Apple deletion credential" }, 502)
  }
})
