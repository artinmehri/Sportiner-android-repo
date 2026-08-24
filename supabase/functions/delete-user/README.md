# Delete User Edge Function

This Supabase Edge Function handles complete user account deletion in compliance with Apple's Guideline 5.1.1 requirements.

## Deployment

### Prerequisites
- Supabase project with the following tables: `users`, `games`, `game_players`, `conversation_members`, `messages`, `chat`
- Supabase Storage bucket named `files` for profile pictures
- Service Role Key (required for admin operations like deleting auth users)
- The `apple_revocation_credentials` migration applied, which stores per-user Apple refresh tokens in Supabase Vault
- Apple secrets: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`

### Deploy using Supabase CLI

1. Install Supabase CLI if not already installed:
```bash
npm install -g supabase
```

2. Login to your Supabase account:
```bash
supabase login
```

3. Link to your project:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

4. Deploy the functions:
```bash
supabase functions deploy apple-token-exchange
supabase functions deploy delete-user
```

5. Set the required environment variables:
```bash
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set APPLE_CLIENT_ID=com.sportiner.app
supabase secrets set APPLE_TEAM_ID=your_apple_team_id
supabase secrets set APPLE_KEY_ID=your_apple_key_id
supabase secrets set APPLE_PRIVATE_KEY='your_sign_in_with_apple_p8_private_key'
```

## Function Behavior

The function performs the following operations in order:

1. **Authentication**: Verifies the JWT token from the Authorization header
2. **Apple revocation**: Revokes the stored refresh token before any destructive cleanup. Legacy Apple users receive `409 APPLE_REAUTH_REQUIRED` until they complete one fresh Apple authorization
3. **Apple credential cleanup**: Removes the encrypted Vault secret after Apple confirms revocation
4. **Messages**: Deletes all messages sent by the user
5. **Conversation memberships**: Removes the user from all conversations
6. **Game memberships**: Removes the user from all games they joined
7. **Hosted games**: Deletes all games hosted by the user
8. **User record**: Deletes the user row from the `users` table
9. **Profile photo**: Deletes the profile picture from Supabase Storage
10. **Auth user**: Deletes the Supabase auth user

## Security

- Uses Service Role Key for admin operations
- Validates JWT token before any deletion
- Does not trust client-supplied userId - uses auth.uid() from the JWT
- Stores Apple refresh tokens only in Supabase Vault and exposes the Vault RPCs only to `service_role`
- Never sends the Apple private key or refresh token to the client
- Stops before deleting any user data when a legacy Apple account needs reauthorization
- All deletions happen server-side with proper authentication

## Client Usage

The client should call the function without passing userId:

```typescript
const { data, error } = await supabase.functions.invoke('delete-user', {
  body: {}, // No userId needed - extracted from JWT
})
```

## TypeScript Errors

TypeScript errors in the IDE are expected and can be ignored. This is a Deno-based Edge Function that runs in Supabase's environment, not in the local Node.js environment. The imports and Deno globals will work correctly when deployed.

## Testing

To test the deletion flow:
1. Create a test account
2. Upload a profile photo
3. Create a game
4. Send chat messages
5. Call the delete-user function
6. Verify:
   - Login fails afterward
   - Profile disappears from users table
   - Storage avatar is removed
   - User content is deleted
