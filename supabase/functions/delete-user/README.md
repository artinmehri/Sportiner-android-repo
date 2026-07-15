# Delete User Edge Function

This Supabase Edge Function handles complete user account deletion in compliance with Apple's Guideline 5.1.1 requirements.

## Deployment

### Prerequisites
- Supabase project with the following tables: `users`, `games`, `game_players`, `conversation_members`, `messages`, `chat`
- Supabase Storage bucket named `files` for profile pictures
- Service Role Key (required for admin operations like deleting auth users)

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

4. Deploy the function:
```bash
supabase functions deploy delete-user
```

5. Set the required environment variables:
```bash
supabase secrets set SUPABASE_URL=your_supabase_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Function Behavior

The function performs the following operations in order:

1. **Authentication**: Verifies the JWT token from the Authorization header
2. **Messages**: Deletes all messages sent by the user
3. **Conversation Memberships**: Removes user from all conversations
4. **Game Memberships**: Removes user from all games they joined
5. **Hosted Games**: Deletes all games hosted by the user
6. **User Record**: Deletes the user row from the `users` table
7. **Profile Photo**: Deletes the profile picture from Supabase Storage
8. **Auth User**: Deletes the Supabase auth user
9. **Apple Token**: Revokes Apple Sign In token if applicable

## Security

- Uses Service Role Key for admin operations
- Validates JWT token before any deletion
- Does not trust client-supplied userId - uses auth.uid() from the JWT
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
