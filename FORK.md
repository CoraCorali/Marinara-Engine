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

- **The relationship tracker.** A bond between your persona and one character in one roleplay,
  and the point of it is that bonds are not all the same shape. Each kind tracks its own two
  things, so a sister is never scored on "wanting" and a friend is never scored like a love
  interest: romantic tracks wanting and patience, family tracks closeness and friction, a rival
  tracks respect and hostility, an ex tracks unfinished business and bitterness.
  Boyfriend and husband are not kinds, they are rungs: a romance carries a ladder from talking
  through dating, together, living together, engaged and married, and no other kind has one.
  Changing a romance into a friendship drops the rung rather than hiding it, and changing back
  starts at the bottom instead of quietly restoring what it used to be.
  Where everything stands is sent with every reply as a short note placed next to the newest turn,
  late in the prompt on purpose, since a relationship is what a model most often contradicts after
  twenty messages. Meters go as words rather than numbers, because a model reads "patience almost
  gone" better than it reads 34. A chat that never opens the tracker sends nothing.
  Marinara's own Relationship Tracker is a downloadable agent that lives in Marinara-Agents, so it
  is untouched; this is the fork's own, Engine-side.
- **The Director's chair and Scene Spark got their interfaces fixed.** In the Director the note is
  the thing you act on, so it no longer scrolls away inside the conversation: it is pinned above
  the two buttons, and it is editable, because the model's wording is a starting point rather than
  a verdict. The composer grows to a few lines instead of being a single-line box. An empty panel
  leads with the four openers rather than a strip of chips under nothing. There is a way to start
  over, and when **Rewrite reply** is unavailable it now says why instead of just sitting greyed
  out. In Scene Spark the control row was 9px type in 22px-tall buttons; it is readable type in
  real tap targets now, the choices themselves are a size up, and the labels no longer run a
  continuous accent animation, which four choices were doing at once on every turn.

### Bug pass over the closet, the tracker and the new interfaces

- **The bonds note was reaching the model twice.** It was pushed onto the shared message list and
  again onto the per-responder list, which is built from that same list, so every roleplay prompt
  carried it twice. Only the per-responder push remains, which is also the right place: it runs
  after macros resolve and lands once per responder in a group chat.
- **The outfit now goes as words as well as pictures.** The sentence existed and was never
  injected, so a provider that drops images got nothing at all from the closet.
- **Editing a field no longer saves on every keystroke.** The closet's labels and the tracker's
  names, notes and sliders each called the server from `onChange`, which meant one request per
  character typed and one per step of a dragged slider. Besides the traffic, the replies arrive out
  of order and could overwrite the box mid-word. Fields now save a moment after you stop, a pending
  edit always beats what comes back from the server, and closing a panel mid-edit saves rather than
  loses what was typed.
- **The tracker can follow someone who is not a card.** The add row used to disappear once every
  card in the chat was tracked, so a neighbour, a boss or the man at the door could never be
  tracked at all. There is a "someone else" option now, and the row no longer hides itself.

### The tracker fills itself in

- **An agent can now move the tracker.** Storage, the panel and the prompt note shipped first,
  which left the numbers to be dragged by hand; this is the half that watches the scene. A custom
  agent set to the **Relationship Tracker Update (Fork)** result returns where it thinks each bond
  now stands, and what that is allowed to do to what is already stored is decided in
  `fork-bond-updates.ts` rather than trusted:
  - A meter moves at most 20 in one reply. One sharp line will otherwise send patience from 80 to
    5, and a tracker that teleports contradicts itself and then feeds the contradiction back into
    the prompt. A real collapse still arrives over a few turns, which is how long it takes in the
    writing anyway.
  - A romance moves at most one rung. Nobody goes from talking to married in one reply.
  - A bond it does not name is left alone, and a field it leaves out never resets anything: no
    kind in the update means the kind stays, so a romance is never quietly demoted to "knows each
    other". A kind it invents is ignored rather than normalised into something it did not mean.
  - A name it does not recognise becomes a new bond rather than overwriting the nearest one, and
    starts at the middle on both meters, because a first impression is not a measurement.
  - Naming the same person twice in one reading applies once.
  It runs on a normal reply and on a re-roll, and it needs the agent to hold **Edit trackers**.
  Nothing happens without such an agent, so the tracker still works entirely by hand if you prefer
  that. The panel re-reads the bonds whenever you open it, so what an agent moved is there.

  The prompt to paste into that agent, which matches the JSON the editor shows as its example:

  > Read the last few messages and report where each tracked relationship now stands. Reply with
  > JSON only: `{"bonds":[{"who":"","kind":"","stage":"","first":0,"second":0,"note":""}]}`.
  > `who` is the character's name exactly as it appears in the chat. `kind` is one of love,
  > family, friend, rival, ex, other. `stage` applies only to love and is one of talking, dating,
  > together, living, engaged, married. `first` and `second` are 0-100 for that kind's two meters:
  > love is wanting and patience, family is closeness and friction, friend is closeness and trust,
  > rival is respect and hostility, ex is unfinished business and bitterness, other is closeness
  > and trust. `note` is one short line on where it stands. Only include a relationship the scene
  > actually said something about, and leave out any field you are not sure changed.

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
| `packages/client/src/components/agents/AgentEditor.tsx` | Offers the fork tracker result to custom agents |
| `packages/client/src/lib/custom-agent-result-examples.ts` | The JSON example for that result |
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
| `packages/client/src/components/chat/ForkBoardStrip.tsx` | Bonds button too |
| `packages/client/src/components/chat/CyoaChoices.tsx` | Readable controls and choices |
| `packages/server/src/services/storage/chats.storage.ts` | Clears a chat's bonds when it goes |
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
