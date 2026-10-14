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
- **Update a preset in place.** Importing a preset you already have asks whether to update it or add a copy.
  Updating keeps the preset's id, so every chat using it stays on it, and keeps its generation parameters and the
  toggle picks you had made for variables the new version still has. Sections, groups and choice blocks are
  replaced. A file exported from here remembers which preset it came from, so re-importing it updates that one
  however it has been renamed since. Failing that the name decides, ignoring the version number in it, so
  "FF 5.4.8 Jules Custom" is updated by "FF 5.4.9 Jules Custom" rather than sitting beside it. Two presets that
  both match means no obvious target, so that always adds a copy.
- **Preset regex packs.** A preset export now carries the regex scripts assigned to that preset alone, so one file
  installs both. Updating a preset replaces its pack instead of leaving old copies behind. Scripts that are global,
  or shared with another preset, are never touched. Imported scripts accept this fork's shape and SillyTavern's;
  unsafe patterns are skipped the same way Marinara skips them elsewhere.
- **Reference board.** A roleplay chat gets a board of pinned reference pictures with captions.
  Pins marked "in scene" are sent to the AI with every reply, so an outfit or a room stays the same
  instead of drifting. **This chat** pins belong to one roleplay; **Always on** pins belong to the
  persona and follow them into every chat (hair, jewellery, a wedding ring). A strip above the
  message box shows what the AI is currently seeing, with a Board button to open the full board.
  Pins and lorebook reference images share one image budget per reply, so a board cannot crowd out
  lore. A board holds at most 60 pins. Pin pictures reuse the lorebook reference-image store, so
  they share its size and type limits, its validated paths and its serving route.
  The board's table registers itself the way capability packages register theirs, so it needs no
  storage-format bump and stock Marinara simply ignores the file.
- **Director's chair.** A 🎬 **Director** button above the message box opens an off-the-record chat
  with the chat's own model. It sees the same scene the writer model does, so you can say
  "that felt out of character" and work out what should happen instead. Nothing said there enters
  the roleplay. As you talk it keeps a short **note**, and **Rewrite reply** regenerates the last
  reply with that note as its direction, keeping the original as a swipe. **Save for next** puts the
  note in the composer as a `/guided` command instead, so it steers your next reply. The
  conversation is kept per chat while the app is open.

### Bug pass after the first build

- Deleting a chat or a persona now clears its board and the pictures with it. The board is
  registered storage, so Marinara's own delete cascade does not reach it.
- **Rewrite reply** only offers itself while the newest message is the reply. With a message of
  yours after it, rewriting an older reply would strand everything written since, so only
  **Save for next** is available there.
- **Save for next** refuses to overwrite a message you have already started typing.
- The Director reads only the tail of a chat instead of loading every message on each turn.

### What the Director reads

Checked after the first build, because "it can see the cards and the scene" was only half true.
It now gets five things, each left out when the chat has nothing to put in it:

- **The character cards** in the scene (name, description, personality), up to six.
- **Your own character** — the chat's persona or persona card, which it was missing entirely,
  so "would she really say that" has something to answer from.
- **The lore in play**: the chat's own lorebooks plus its characters' and its persona's, scanned
  against the same recent messages the Director is reading, under the chat's lorebook token
  budget. Constant entries come through, lorebooks you excluded for this chat do not, and at most
  twelve entries go so lore cannot crowd out the scene. A lorebook that fails to load is logged
  and skipped rather than failing the turn.
- **The story so far**: the chat's running Roleplay summary, so it knows what happened before the
  tail it can read.
- **The recent scene**: the last ten messages, with system, hidden and command-only messages
  dropped. Your turns read as the writer's, narration and replies read as the story.

Markup is stripped and every part is length-capped before it is sent.

### 2026-10-14

- **The closet.** A persona's wardrobe. Each piece is a picture with a label and a slot, and one
  piece per slot is worn at a time. A dress takes the place of a top and a bottom, and either of
  those takes the place of the dress; the rest are independent, so a bag and a necklace sit happily
  beside anything. What she has on rides along with every reply as pictures, so an outfit stays put
  instead of drifting a paragraph later. The outfit goes into the image budget ahead of the board
  and lorebook pictures, since what she is wearing should survive a crowded board. A **Closet**
  button sits beside **Board** above the message box. A closet holds at most 80 pieces, and its
  pictures reuse the lorebook reference-image store, so they share its size and type limits, its
  validated paths and its serving route. Deleting a persona clears her closet and its pictures.
  The table registers itself the way capability packages register theirs, so it needs no storage
  format bump and stock Marinara simply ignores the file.
  The in-scene strip above the message box no longer hides itself when a chat has no pins, since
  the Closet button lives there too.
- **Drawing new pieces.** Describe a piece and it is drawn into the closet, using a picture she
  already owns as the style reference, so a new skirt looks like it belongs beside the ones already
  hanging up. The first piece in the closet is the reference; with an empty closet it draws without
  one and says so. The slot shapes the request, so "a red one" still produces the right kind of
  thing, and the wording asks for the garment alone, laid flat on plain white with clear space
  around every edge, which is what makes a piece cuttable afterwards. It uses the default image
  generation connection. A failed draw leaves nothing behind.

- **Rain stops dropping frames.** Two things in the draw loop, both in the engine rather than in
  any theme. Every raindrop used to cost its own path and its own stroke, so a thunderstorm spent
  120 driver calls a frame on a field of two-pixel lines; drops now share a path with the others of
  roughly their width and alpha, which bounds the strokes at fifteen however hard it rains, and the
  rounding is finer than the eye follows on a falling line. Separately, the test for which
  particles drift sideways built a fresh array for every particle on every frame, around seven
  thousand throwaway arrays a second in a storm, all of it work for the garbage collector; it is a
  Set now. Both apply to every weather, not only rain, and neither changes what you see.
  This does not touch whatever a theme's own blur and glow cost on top.

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
| `packages/server/src/app.ts` | Registers the board and closet tables at startup |
| `packages/server/src/db/connection.ts` | `registerForkTables` helper |
| `packages/server/src/routes/index.ts` | Registers the board and Director routes |
| `packages/server/src/routes/generate.routes.ts` | Sends in-scene pins and the worn outfit with the reply |
| `packages/client/src/components/chat/ChatArea.tsx` | Closet modal and its opener |
| `packages/client/src/components/chat/ForkBoardStrip.tsx` | Closet button beside Board |
| `packages/server/src/services/storage/characters.storage.ts` | Clears the closet when a persona goes |
| `packages/client/src/lib/weather-renderer.ts` | Batched rain drawing |
| `packages/client/src/workers/weather-effects.worker.ts` | Draws the field in one pass, no per-particle allocation |
| `packages/client/src/components/chat/WeatherEffects.tsx` | Same, on the non-worker path |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx` | In-scene strip |
| `packages/client/src/components/chat/ChatInput.tsx` | Director button (and the Spark button) |
| `packages/server/src/routes/generate.routes.ts` | Saves which agent made the choices |
| `packages/server/src/routes/generate/retry-agents-route.ts` | Same, for re-rolled choices |
| `packages/shared/src/schemas/lorebook.schema.ts` | Whole-word default |
| `packages/server/src/services/storage/lorebooks.storage.ts` | Whole-word default |

## Known upstream issue kept as is

Preset conditions like `{{#if custom_toggles contains "VOICE"}}` match partial text, so `VOICE` also matches
`VOICE2`. Changing `contains` would change every other preset and lorebook condition, and presets shared with
regular Marinara users have to work there too, so the fork keeps upstream behavior. Write conditions with
`not contains` guards, or report it upstream.
