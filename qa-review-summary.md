# QA Review Summary

Date: 2026-07-11  
Reviewer: Codex QA / React Native / Linear execution pass  
Repository reviewed: `/Users/artinmehri/sportiner2.0-monorepo/apps/mobile`

## Executive Summary

Total Todo issues reviewed: 7  
Active Todo issues reviewed: 6  
Archived/not reviewable Todo issues reviewed: 1  
Moved to In Review: 0  
Kept in Todo: 7

No issue was moved to In Review. The active issues either require physical iPhone/App Store Connect evidence that was not available in this environment, fail an executable quality gate, or have implementation gaps against the written acceptance criteria.

## Verification Performed

- Read Linear `Sportiner` team statuses and confirmed the unstarted status is named `Todo`.
- Reviewed all issues returned in `Todo`: SPO-197, SPO-187, SPO-181, SPO-185, SPO-186, SPO-178, SPO-159.
- Inspected auth, onboarding, agreement, Event Details, profile, games, chat, Supabase, and game data code paths.
- Ran `npx tsc --noEmit` from `apps/mobile`: passed.
- Ran `npm run lint` from `apps/mobile`: failed with 2 errors and 89 warnings.
- Did not perform physical iPhone testing, OAuth sign-in, App Store Connect upload, TestFlight submission, or Supabase database verification because those require external device/account/runtime evidence not available through this execution environment.

## Issues Reviewed

### SPO-187: Auth flow - Final test signup and agreement paths

Expected behavior:
- Email signup shows the agreement before onboarding, persists `accepted_terms = true`, then reaches tabs.
- Google and Apple signup show the agreement before onboarding for new users.
- Social onboarding does not ask for email/password.
- Existing users reach tabs and do not get stuck in onboarding.
- No TypeScript errors or runtime crashes.

What was tested:
- Static review of `SignUp.tsx`, `login.tsx`, `SignupFlow.tsx`, `user-agreement.tsx`, `_layout.tsx`, and onboarding pages.
- Verified TypeScript with `npx tsc --noEmit`.
- Verified lint with `npm run lint`.
- Reviewed social onboarding field visibility and Apple display-name fallback.

Result: Failed

Problems found:
- High: New signup paths can bypass the agreement screen after the signup screen is reachable. `app/_layout.tsx` does send a clean logged-out device with no `sportiner_terms_seen` key to `user-agreement` first, so the fresh-install path is partially protected. However, once `/(auth)/SignUp` is reachable, Google, Apple, and email signup route directly to `/(auth)/SignupFlow` with `acceptedTerms: "true"` instead of requiring a verified agreement state. Reproduce with `sportiner_terms_seen=true`, by returning to signup after accepting terms locally without completing registration, or by navigating directly to `/(auth)/SignUp`; then tap Continue with Email. Expected: registration should only proceed from a trusted agreement acceptance. Actual: onboarding can start with `acceptedTerms` injected by route params.
- High: New social login paths can bypass the agreement screen from `login.tsx` when `userExists()` returns false. Expected: agreement before onboarding. Actual: direct route to `SignupFlow` with `acceptedTerms: "true"`.
- Medium: `SignupFlow` trusts a route parameter for `acceptedTerms` instead of a server-side or locally verified agreement state.
- Medium: `npm run lint` fails with errors in `login.tsx` and `EventDetails.tsx`.

Code review notes:
- `app/_layout.tsx` protects the clean first-launch no-session/no-local-terms path by routing to `user-agreement` with `next=signup`.
- Social onboarding correctly hides email/password for Google and Apple.
- Apple fallback display name exists through `Apple User` in `firstOnbPage.tsx` when provider name is missing.
- `accepted_terms` is persisted during `SignupFlow.addData()`, but the precondition is not trustworthy because it is route-param based.

Final decision: Kept in Todo. The agreement-before-signup acceptance criterion is not met.

### SPO-185: Release QA - Test App Review core flows on physical iPhone

Expected behavior:
- Fresh install opens correctly.
- Agreement appears before registration/login.
- Email, Google, Apple signup paths work on physical iPhone.
- Existing login works.
- Create/join/message/cancel/leave/report/block flows work.
- iPhone-only config is correct.
- `npx tsc --noEmit` passes.

What was tested:
- `npx tsc --noEmit`: passed.
- Reviewed `app.json`; iOS has `supportsTablet: false`.
- Reviewed relevant auth, game, report, and block code.
- `npm run lint`: failed.

Result: Failed / Not fully verifiable

Problems found:
- Critical: Physical iPhone testing was not performed, and the ticket explicitly requires it.
- High: Agreement-before-registration is only partially protected by `app/_layout.tsx` for clean first launch. It is not reliable at the route/action level because signup routes can inject `acceptedTerms: "true"` and enter onboarding once `SignUp` is reachable.
- Medium: `npm run lint` fails with 2 errors and 89 warnings.
- Medium: Report/block flows are present in Event Details/profile, but successful Supabase writes and RLS behavior were not verified.

Code review notes:
- The app is configured as iPhone-only in `app.json`.
- The current repo has no automated E2E test suite for these core release flows.

Final decision: Kept in Todo. Required physical-device QA and several acceptance criteria are not complete.

### SPO-181: App Review - Record required compliance flows for resubmission

Expected behavior:
- Physical-device screen recording shows EULA before registration/login.
- Recording shows report/flag flow.
- Recording shows block-user flow.
- Video is attached/uploaded with App Review submission package.
- Review notes mention Guideline 1.2 UGC safeguards.

What was tested:
- Reviewed agreement screen content and report/block UI entry points.
- Checked Linear issue attachments/documents; no recording evidence was present.

Result: Failed / Not verifiable

Problems found:
- Critical: No physical-device screen recording was available or produced.
- Critical: No App Store Connect upload/review-notes evidence was available.
- High: The EULA-before-registration path is not guaranteed outside the clean first-launch route because signup entry points can inject `acceptedTerms: "true"` after `SignUp` is reachable.

Code review notes:
- `user-agreement.tsx` includes zero-tolerance, objectionable content, abusive behavior, and reporting language.
- Event Details and profile detail expose report/block actions, but chat-specific reporting is not present.

Final decision: Kept in Todo. Required recording/submission evidence is missing.

### SPO-197: Event details - Fix report and block host actions

Expected behavior:
- Report Host creates a report record.
- Block Host creates a blocked-user record.
- Blocked host games are hidden after refresh.
- Success messages are shown.
- Supabase/RLS errors are logged clearly.
- Works on physical iPhone.
- `npx tsc --noEmit` passes.

What was tested:
- Reviewed `EventDetails.tsx`, `AuthContext.tsx`, and `GameContext.tsx`.
- Verified TypeScript with `npx tsc --noEmit`.
- Reviewed game filtering for blocked host IDs.

Result: Partially passed

Problems found:
- High: End-to-end Supabase insert success was not verified. The code writes to `reports`, `blocked_users`, and `moderation_events`, but there is no local proof that table names, columns, or RLS policies accept these writes.
- High: Physical iPhone testing was not performed.
- Medium: Duplicate block attempts may fail if `blocked_users` has a uniqueness constraint; there is no idempotent upsert or “already blocked” handling.
- Medium: Blocking navigates back after success, but there is no immediate local refresh proof from the Event Details path.
- Medium: `npm run lint` fails, including an error in `EventDetails.tsx`.

Code review notes:
- The UI is reachable through the Event Details three-dot menu for non-host users.
- Error logging exists for Supabase insert failures.
- `GameContext.refreshGames()` filters out blocked host IDs after refresh.

Final decision: Kept in Todo. Static code is present, but functional acceptance was not verified and lint fails.

### SPO-178: User safety - Add flagging for objectionable content

Expected behavior:
- Users can report objectionable content from relevant app surfaces.
- Flagging entry points are easy to discover.
- Report action is functional end to end or clearly captured for moderation workflow.
- Flow is ready for App Review physical-device screen recording.

What was tested:
- Searched and reviewed report/block entry points across Event Details, profile details, games, direct chat, group chat, and inbox.
- Reviewed Supabase report insert usage.

Result: Partially passed

Problems found:
- High: Direct chat and group chat do not expose report/flag actions directly, despite being listed in the issue as UGC surfaces.
- High: Game dashboard/list overflow menus expose share/view/cancel/leave but not report/flag game content.
- High: End-to-end report submission and moderation workflow were not verified against Supabase/RLS.
- High: App Review physical-device readiness was not verified.

Code review notes:
- Profile details provide Report User and Block User actions.
- Event Details provides Report Host and Block Host actions.
- Some game/player reporting can be reached indirectly by opening a profile, but that does not cover reporting a specific chat message, group-chat content, or game listing content.

Final decision: Kept in Todo. Relevant surfaces are not fully covered.

### SPO-186: TestFlight - Upload archive and submit new App Review build

Expected behavior:
- Archive uploaded successfully.
- New build appears in App Store Connect/TestFlight.
- Review notes mention the attached compliance recording.
- App submitted for App Review.

What was tested:
- Reviewed issue details and local app config.
- Checked available issue attachments/documents; no upload/submission evidence was present.

Result: Failed / Not verifiable

Problems found:
- Critical: Xcode archive/upload was not performed in this environment.
- Critical: No App Store Connect/TestFlight evidence was available.
- Critical: Compliance recording dependency from SPO-181 is not satisfied.

Code review notes:
- `app.json` has iOS build number `58`, Apple Sign-In enabled, and `supportsTablet: false`.

Final decision: Kept in Todo. This is an external release-operation task and has no completion evidence.

### SPO-159: Homepage

Expected behavior:
- Not specified.

What was tested:
- Reviewed Linear ticket metadata.

Result: Not reviewable

Problems found:
- Medium: Issue is archived and has no description or acceptance criteria.

Code review notes:
- No implementation scope can be inferred without guessing.

Final decision: Kept in Todo. Archived issue with no testable requirements.

## Critical Bugs Found

- New signup paths can bypass the required user agreement by routing directly to `SignupFlow` with `acceptedTerms: "true"`.
- Physical-device App Review evidence is missing for release/compliance tickets.
- App Store Connect/TestFlight submission evidence is missing.

## High-Priority Follow-Up Work

- Route all new signup and new social-auth users to `user-agreement` first; do not allow `acceptedTerms` to be granted only through a route parameter.
- Persist agreement acceptance through a trusted flow before onboarding starts.
- Add report/flag entry points for direct chat, group chat, and game listing content, not only user profiles/Event Details.
- Verify `reports`, `blocked_users`, and `moderation_events` table schemas and RLS policies with authenticated test users.
- Fix lint errors before release QA.
- Run the full checklist on a physical iPhone and attach the recording/build evidence to the relevant Linear issues.

## Overall Codebase Health

The codebase has working TypeScript compilation, but release readiness is not there yet. The main recurring risks are auth-flow trust boundaries, manual-only QA, missing direct safety entry points on UGC surfaces, and broad lint debt. The absence of automated tests makes regressions likely in auth, onboarding, and game/join/report flows.

## Recommendations For Testing Quality

- Add unit tests around auth route decision helpers so agreement/onboarding/tabs routing cannot regress.
- Add E2E coverage for email signup, Google signup, Apple signup, existing login, logout/login again, and app restart with persisted session.
- Add Supabase integration tests or scripted smoke tests for report/block insert policies using test accounts.

## Update: 2026-07-12 - SPO-178 Re-review

Issue title: User safety - Add flagging for objectionable content

Expected behavior:
- Users can report objectionable content from user profiles/profile pictures, direct chats, group chats, game detail screens, game listings/posts, and host/participant contexts.
- Reporting entry points are discoverable.
- Reports are captured in the moderation workflow with enough context to review.
- The flow is ready to demonstrate in an App Review physical-device recording.

What was tested:
- Reviewed `SPO-178` in Linear and confirmed the exact acceptance criteria.
- Verified shared `ReportModal` reason/detail UI.
- Verified direct chat exposes report user, report message, and block user actions for messages from other users.
- Verified group chat exposes report user, report message, and block user actions for messages from other users.
- Verified profile details expose report user and block user actions, covering profile/profile-picture reporting.
- Verified event details expose report host and block host actions with `reported_post_id` captured.
- Fixed and verified game dashboard listing overflow menus now expose `Report Game` for games hosted by another user.
- Verified game listing reports submit `reported_user_id`, `reported_post_id`, selected reason, details, `pending` status, and timestamp through the shared moderation insert path.
- Verified self-reporting is prevented by hiding the listing report action for games hosted by the current user and by the shared `submitModerationReport` guard.
- Reviewed Supabase migration for `reports`, `blocked_users`, indexes, and authenticated RLS insert/read policies.
- Regression checked block filtering for games from blocked hosts and blocked chat relationships.
- Ran `npx tsc --noEmit`: passed.
- Ran `npm run lint`: passed with 0 errors and 68 existing warnings.
- Ran `npx expo lint --no-cache`: passed with 0 errors and 68 existing warnings.

Result: Passed

Problems found:
- None blocking for SPO-178 after the game listing report entry point was added.

Code review notes:
- `apps/mobile/app/(tabs)/games.tsx` now carries `hostId` through the `GameCard` model and uses the shared report modal to submit game/listing reports.
- `apps/mobile/context/ChatContext.tsx` centralizes report insertion for message, user, and game/post reports.
- `apps/mobile/components/ReportModal.tsx` provides App Review-friendly reason selection, optional details, disabled submitting state, and clear submit labeling.
- The remaining lint warnings are pre-existing repository hygiene issues and are not new blockers for this safety task.

Final decision: Moved to In Review. SPO-178 now meets the written acceptance criteria and is ready for physical-device App Review recording.
- Add a release QA checklist template with evidence fields: device, build number, account type, screenshots/video, and pass/fail notes.
- Add lint/typecheck to CI and block review while lint has errors.
