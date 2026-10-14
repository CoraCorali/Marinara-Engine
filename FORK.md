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
- **Spark button.** When a Roleplay chat has an active custom agent whose result type is Interactive Choices
  (Scene Spark), a 💡 **Spark** button appears above the message box. It runs that agent right now, skipping its
  keyword, cadence and Decision-model gates. It also works on a chat with no story yet, where Scene Spark offers
  opening scenes. Choices from any choice agent now reach the choice bar, not only the official CYOA agent's.
  On a chat with no messages the choices live until the page reloads, since there is no message to store them on.
- **Update a preset in place.** Importing a preset whose name matches one you already have asks whether to update
  it or add a copy. Updating keeps the preset's id, so every chat using it stays on it, and keeps its generation
  parameters and the toggle picks you had made for variables the new version still has. Sections, groups and
  choice blocks are replaced. Two presets sharing a name means no obvious target, so that always adds a copy.
- **Preset regex packs.** A preset export now carries the regex scripts assigned to that preset alone, so one file
  installs both. Updating a preset replaces its pack instead of leaving old copies behind. Scripts that are global,
  or shared with another preset, are never touched. Imported scripts accept this fork's shape and SillyTavern's;
  unsafe patterns are skipped the same way Marinara skips them elsewhere.

## Upstream files touched

Fork-only code lives in `packages/client/src/lib/fork/`, `packages/server/src/services/import/fork/`
and `scripts/regressions/fork-*.regression.ts`.
Edits to upstream files are marked with a `Fork:` comment.

| File | Why |
| --- | --- |
| `packages/client/src/components/chat/ChatArea.tsx` | Edit & resend handler and props |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx` | Passes Edit & resend to the right message |
| `packages/client/src/components/chat/ChatMessage.tsx` | Resend button in the message editor |
| `packages/client/src/localization/locales/en.json` | Two strings for the resend button |
| `packages/client/src/components/chat/CyoaChoices.tsx` | Re-roll reruns the agent that made the choices |
| `packages/client/src/components/chat/ChatInput.tsx` | Spark button |
| `packages/client/src/hooks/use-generate.ts` | Choice results from any choice agent reach the choice bar |
| `packages/client/src/components/modals/ImportPresetModal.tsx` | Update-or-copy prompt on preset import |
| `packages/server/src/services/import/marinara.importer.ts` | Preset update in place, regex pack install |
| `packages/server/src/routes/prompts.routes.ts` | Preset export carries its regex pack |
| `packages/server/src/routes/generate.routes.ts` | Saves which agent made the choices |
| `packages/server/src/routes/generate/retry-agents-route.ts` | Same, for re-rolled choices |
| `packages/shared/src/schemas/lorebook.schema.ts` | Whole-word default |
| `packages/server/src/services/storage/lorebooks.storage.ts` | Whole-word default |

## Known upstream issue kept as is

Preset conditions like `{{#if custom_toggles contains "VOICE"}}` match partial text, so `VOICE` also matches
`VOICE2`. Changing `contains` would change every other preset and lorebook condition, and presets shared with
regular Marinara users have to work there too, so the fork keeps upstream behavior. Write conditions with
`not contains` guards, or report it upstream.
