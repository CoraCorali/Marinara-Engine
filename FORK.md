# Jules' Marinara fork

Personal fork of [Pasta-Devs/Marinara-Engine](https://github.com/Pasta-Devs/Marinara-Engine), focused on Roleplay mode.
Upstream changes come in through GitHub's **Sync fork** button. This file lists what the fork adds and every
upstream file it touches, so conflicts after a sync are quick to find.

## Changes

### 2026-10-13

- **Edit & resend.** While editing your newest message in a Roleplay chat, a blue send button next to Save keeps the
  edit and gets a fresh reply in one tap. The old reply stays as a swipe. With no reply yet, it retries like an empty
  Send. Only the newest user turn offers it, so later turns are never left built on old wording.
  In a group chat set to manual reply order with no reply yet, it saves the edit and lets you pick the speaker,
  the same as an empty Send.
- **New lorebook entries match whole words by default**, so a key like "ass" no longer fires inside "class".
  Imports and the per-entry toggle still decide for themselves. Existing entries are unchanged; use the lorebook's
  batch edit to switch them. Whole words means a key like "kiss" no longer catches "kissed", so add the forms
  you want as extra keys.
- **Re-roll works for custom choice agents.** The choice bar remembers which agent made its choices, so Re-roll
  reruns that agent (for example Scene Spark) instead of only the official CYOA Choices agent.

## Upstream files touched

Fork-only code lives in `packages/client/src/lib/fork/` and `scripts/regressions/fork-*.regression.ts`.
Edits to upstream files are marked with a `Fork:` comment.

| File | Why |
| --- | --- |
| `packages/client/src/components/chat/ChatArea.tsx` | Edit & resend handler and props |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx` | Passes Edit & resend to the right message |
| `packages/client/src/components/chat/ChatMessage.tsx` | Resend button in the message editor |
| `packages/client/src/localization/locales/en.json` | Two strings for the resend button |
| `packages/client/src/components/chat/CyoaChoices.tsx` | Re-roll reruns the agent that made the choices |
| `packages/server/src/routes/generate.routes.ts` | Saves which agent made the choices |
| `packages/server/src/routes/generate/retry-agents-route.ts` | Same, for re-rolled choices |
| `packages/shared/src/schemas/lorebook.schema.ts` | Whole-word default |
| `packages/server/src/services/storage/lorebooks.storage.ts` | Whole-word default |

## Known upstream issue kept as is

Preset conditions like `{{#if custom_toggles contains "VOICE"}}` match partial text, so `VOICE` also matches
`VOICE2`. Changing `contains` would change every other preset and lorebook condition, and presets shared with
regular Marinara users have to work there too, so the fork keeps upstream behavior. Write conditions with
`not contains` guards, or report it upstream.
