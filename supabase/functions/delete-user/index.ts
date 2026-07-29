// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://prswdcjmowfdvalyutlu.supabase.co"
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
const filesBucket = Deno.env.get("PROFILE_PHOTO_BUCKET") ?? "files"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type QueryResult = {
  error?: {
    message?: string
    code?: string
    details?: string
  } | null
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]))
}

async function requireSuccess(step: string, action: () => Promise<QueryResult>) {
  const { error } = await action()

  if (error) {
    const detail = [error.message, error.code, error.details].filter(Boolean).join(" ")
    throw new Error(`${step} failed${detail ? `: ${detail}` : ""}`)
  }
}

async function getRequestBody(req: Request) {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

function extractStoragePath(value: string | null | undefined, userId: string) {
  if (!value) return null

  if (value.startsWith(`${userId}/`)) {
    return value
  }

  try {
    const url = new URL(value)
    const publicPrefix = `/storage/v1/object/public/${filesBucket}/`
    const signedPrefix = `/storage/v1/object/sign/${filesBucket}/`

    if (url.pathname.startsWith(publicPrefix)) {
      return decodeURIComponent(url.pathname.slice(publicPrefix.length))
    }

    if (url.pathname.startsWith(signedPrefix)) {
      return decodeURIComponent(url.pathname.slice(signedPrefix.length))
    }

    const pathParts = url.pathname.split("/")
    const bucketIndex = pathParts.indexOf(filesBucket)
    if (bucketIndex >= 0 && bucketIndex + 1 < pathParts.length) {
      return decodeURIComponent(pathParts.slice(bucketIndex + 1).join("/"))
    }

    return null
  } catch {
    const userPathIndex = value.indexOf(`${userId}/`)
    return userPathIndex >= 0 ? value.slice(userPathIndex) : null
  }
}

async function deleteProfilePhotos(supabase: ReturnType<typeof createClient>, profilePicture: string | null, userId: string) {
  const paths = new Set<string>()
  const explicitPath = extractStoragePath(profilePicture, userId)

  if (explicitPath) {
    paths.add(explicitPath)
  }

  const { data: userFiles, error: listError } = await supabase.storage
    .from(filesBucket)
    .list(userId, { limit: 100 })

  if (listError) {
    throw new Error(`list profile photos failed: ${listError.message}`)
  }

  for (const file of userFiles ?? []) {
    if (file?.name) {
      paths.add(`${userId}/${file.name}`)
    }
  }

  if (paths.size === 0) {
    return
  }

  const { error } = await supabase.storage.from(filesBucket).remove(Array.from(paths))
  if (error) {
    throw new Error(`delete profile photos failed: ${error.message}`)
  }
}

async function anonymizeOrDelete(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  userId: string,
) {
  const updatePayload: Record<string, null> = { [column]: null }
  const { error: updateError } = await supabase.from(table).update(updatePayload).eq(column, userId)

  if (!updateError) {
    return
  }

  const { error: deleteError } = await supabase.from(table).delete().eq(column, userId)
  if (deleteError) {
    throw new Error(`${table}.${column} cleanup failed: ${deleteError.message}`)
  }
}

async function anonymizeOrDeleteIn(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  values: string[],
) {
  if (values.length === 0) {
    return
  }

  const updatePayload: Record<string, null> = { [column]: null }
  const { error: updateError } = await supabase.from(table).update(updatePayload).in(column, values)

  if (!updateError) {
    return
  }

  const { error: deleteError } = await supabase.from(table).delete().in(column, values)
  if (deleteError) {
    throw new Error(`${table}.${column} cleanup failed: ${deleteError.message}`)
  }
}

async function revokeAppleTokenIfAvailable(user: any) {
  const provider = user?.app_metadata?.provider
  const appleIdentity = user?.identities?.find((identity: any) => identity?.provider === "apple")

  if (provider !== "apple" && !appleIdentity) {
    return
  }

  const token =
    Deno.env.get("APPLE_REVOKE_TOKEN") ??
    user?.app_metadata?.provider_token ??
    user?.user_metadata?.provider_token ??
    appleIdentity?.identity_data?.provider_token ??
    appleIdentity?.identity_data?.access_token ??
    appleIdentity?.identity_data?.refresh_token

  const clientId = Deno.env.get("APPLE_CLIENT_ID")
  const clientSecret = Deno.env.get("APPLE_CLIENT_SECRET")

  if (!token || !clientId || !clientSecret) {
    console.warn("Apple token revocation skipped because no Apple revocation token/client credentials are available.")
    return
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: appleIdentity?.identity_data?.refresh_token ? "refresh_token" : "access_token",
  })

  const response = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Apple token revocation failed: ${response.status} ${errorBody}`)
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  if (!supabaseServiceKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not configured.")
    return json({ error: "Account deletion is temporarily unavailable." }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    const authHeader = req.headers.get("Authorization")
    const token = authHeader?.replace(/^Bearer\s+/i, "")

    if (!token) {
      return json({ error: "Missing authorization header" }, 401)
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return json({ error: "Invalid or expired token" }, 401)
    }

    const body = await getRequestBody(req)
    if (body?.userId && body.userId !== user.id) {
      return json({ error: "Authenticated user does not match requested account." }, 403)
    }

    const userId = user.id

    const { data: userData, error: userFetchError } = await supabase
      .from("users")
      .select("id, profile_picture")
      .eq("id", userId)
      .maybeSingle()

    if (userFetchError) {
      throw new Error(`load user profile failed: ${userFetchError.message}`)
    }

    const { data: hostedGames, error: hostedGamesError } = await supabase
      .from("games")
      .select("id, chat_id")
      .eq("host_id", userId)

    if (hostedGamesError) {
      throw new Error(`load hosted games failed: ${hostedGamesError.message}`)
    }

    const hostedGameIds = unique((hostedGames ?? []).map((game: any) => game.id))
    const hostedGameChatIds = unique((hostedGames ?? []).map((game: any) => game.chat_id))

    let hostedChatIds = hostedGameChatIds
    if (hostedGameIds.length > 0) {
      const { data: gameChats, error: gameChatsError } = await supabase
        .from("chat")
        .select("id")
        .in("game_id", hostedGameIds)

      if (gameChatsError) {
        throw new Error(`load hosted game chats failed: ${gameChatsError.message}`)
      }

      hostedChatIds = unique([
        ...hostedGameChatIds,
        ...((gameChats ?? []).map((chat: any) => chat.id)),
      ])
    }

    await deleteProfilePhotos(supabase, userData?.profile_picture ?? null, userId)

    await revokeAppleTokenIfAvailable(user)

    await requireSuccess("clear chat last message references", () =>
      supabase
        .from("chat")
        .update({
          last_message: null,
          last_message_at: null,
          last_message_id: null,
          last_message_sender_id: null,
        })
        .eq("last_message_sender_id", userId)
    )

    if (hostedChatIds.length > 0) {
      await requireSuccess("delete hosted game messages", () =>
        supabase.from("messages").delete().in("chat_id", hostedChatIds)
      )

      await requireSuccess("delete hosted chat members", () =>
        supabase.from("conversation_members").delete().in("chat_id", hostedChatIds)
      )
    }

    await requireSuccess("delete user messages", () =>
      supabase.from("messages").delete().eq("sender_id", userId)
    )

    await requireSuccess("delete user conversation memberships", () =>
      supabase.from("conversation_members").delete().eq("id", userId)
    )

    if (hostedGameIds.length > 0) {
      await requireSuccess("delete hosted game conversation memberships", () =>
        supabase.from("conversation_members").delete().in("game_id", hostedGameIds)
      )

      await requireSuccess("delete hosted game requests", () =>
        supabase.from("game_requests").delete().in("game_id", hostedGameIds)
      )
    }

    await requireSuccess("delete user game requests", () =>
      supabase.from("game_requests").delete().eq("user_id", userId)
    )

    if (hostedGameIds.length > 0) {
      await requireSuccess("clear hosted game chat references", () =>
        supabase.from("games").update({ chat_id: null }).in("id", hostedGameIds)
      )

      if (hostedChatIds.length > 0) {
        await requireSuccess("delete hosted chats", () =>
          supabase.from("chat").delete().in("id", hostedChatIds)
        )
      }

      await requireSuccess("delete hosted chats by game", () =>
        supabase.from("chat").delete().in("game_id", hostedGameIds)
      )
    }

    await requireSuccess("delete user game memberships", () =>
      supabase.from("game_players").delete().eq("user_id", userId)
    )

    if (hostedGameIds.length > 0) {
      await requireSuccess("delete hosted game memberships", () =>
        supabase.from("game_players").delete().in("game_id", hostedGameIds)
      )

      await requireSuccess("delete hosted games", () =>
        supabase.from("games").delete().in("id", hostedGameIds)
      )
    }

    await requireSuccess("delete block relationships", () =>
      supabase.from("blocked_users").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
    )

    await anonymizeOrDelete(supabase, "reports", "reporter_id", userId)
    await anonymizeOrDelete(supabase, "reports", "reported_user_id", userId)
    await anonymizeOrDeleteIn(supabase, "reports", "reported_post_id", hostedGameIds)

    await requireSuccess("delete user notifications", () =>
      supabase.from("notifications").delete().eq("user_id", userId)
    )

    await requireSuccess("delete users row", () =>
      supabase.from("users").delete().eq("id", userId)
    )

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      throw new Error(`delete auth user failed: ${authDeleteError.message}`)
    }

    return json({ message: "Account deleted successfully" })
  } catch (error) {
    console.error("delete-user failed:", error)
    return json({ error: "Unable to delete your account. Please try again later or contact support." }, 500)
  }
})
