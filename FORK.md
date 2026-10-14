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

### Bug pass over the tracker and the new interfaces

- **The bonds note was reaching the model twice.** It was pushed onto the shared message list and
  again onto the per-responder list, which is built from that same list, so every roleplay prompt
  carried it twice. Only the per-responder push remains, which is also the right place: it runs
  after macros resolve and lands once per responder in a group chat.
- **Editing a field no longer saves on every keystroke.** The tracker's names, notes and
  sliders each called the server from `onChange`, which meant one request per
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

### Back on track

A review of everything built so far, after the theme detour.

- **The closet is gone.** The reference board already does that job: pin a picture, set it to
  "Currently wearing" and caption it ("her black slip dress, hair down"), and it rides along with
  every reply. Anyone who used the closet keeps its old table file and pictures on disk; nothing
  reads them any more.
- **Board captions now reach the model as words too**, under "Pinned for reference in this scene",
  so a provider that drops images still knows what she has on. A pin with no caption sends only
  its picture.
- **A board caption saves while you type**, a moment after you stop, and when the board closes. It
  used to save only when you tapped out of the box.
- **A branch keeps the board and the tracker.** Branching a roleplay used to start the new branch
  with an empty board and no relationships. It now gets its own copy of both, pictures included,
  so deleting a pin in one branch never takes it from the other.
- **Deleting a chat with all its branches clears their boards and bonds.** Only a single-chat
  delete did before, so the group delete left pictures on disk.
- **The Director reads the reply you are talking about.** Every message it saw was cut to its
  first 600 characters, so "the ending felt off" was a question about text it never saw. The
  newest reply and the turn it answered are now read whole, older messages get 1200 characters,
  and character cards get 4000 per field instead of 1200.
- **The Director knows where the relationships stand and what is pinned**, the same note the
  writer model gets, so it judges a reply against the same picture of things.
- **The Director's prompt shows in debug mode**, like every other model route.
- **Save for next** only writes into this chat's message box.
- **The romance ladder is tappable.** Each rung was an 8px-tall button; the bar is still thin but
  the button around it is a full tap target.
- **"Unfinished business"** reads as that in the prompt, not "unfinished high".
- **The tracker agent can see the tracker.** It was never shown where the bonds stood, so it
  guessed every number fresh each turn and only the 20-point cap slowed the drift. It now gets a
  `<current_relationships>` block with each bond's name, kind, rung, meters and note, and is told
  to report a change from there using the same names. Only that agent sees it.
- **One tap to switch it on.** The tracker panel has a **Keep this updated automatically**
  button. It makes the Relationship Tracker (Fork) agent if there is none yet, with its prompt,
  its result type, the **Edit trackers** permission and the cards and persona as context, and
  switches it on for this chat. Once it is on, the panel says so instead. Nothing to paste.

### Weather that matches the scene

- **Drizzle, rain, heavy rain and thunderstorms each look different.** Drizzle is fine, short and
  faint; rain is what it was; heavy rain is dense, fast and slanted; a thunderstorm is heavy rain
  with the lightning. Fast drops fade in over a few frames instead of sixty, which is why a
  downpour used to look half there: a drop crossed the screen before it finished fading in.
- **Light snow, snow, heavy snow and blizzards.** Light snow is a few small slow flakes, heavy
  snow is thick, and a blizzard blows in sideways from the left edge as well as the top, so the
  bottom of a tall screen gets snow too.
- **Wind is its own effect.** "Windy" draws faint streaks of moving air with a few leaves, and
  wind with rain or snow adds the streaks on top instead of replacing the weather.
- **The wrong picks are gone.** "Cold rain" showed snow, "windy and rainy" showed leaves and no
  rain, "drizzle" and "showers" showed nothing, "dust storm" would have read as a rainstorm, and
  "flash flood" matched "ash". Precipitation is decided first now and words match whole.
- **Seasons.** The scene's date sets a quiet seasonal layer: a few petals in spring, drifting
  golden motes in summer, orange and red leaves in autumn, and a few flakes in winter when nothing
  else is falling. A season named in the weather or the date wins ("late autumn"); otherwise the
  month decides, northern hemisphere. "Fall" only counts in the date, since a weather line says
  "snowfall". A season never adds to a storm, and it shows even when no weather is tracked.
- Particle movement lives in one shared function now, used by both the worker and the
  main-thread fallback, so the two can no longer drift apart.

### Fix this part, and the slop highlighter

- **Fix this part.** Select some of a reply and a **Fix this part** button appears under the
  selection, stacked below Marinara's own **Add to lorebook**. It opens on the passage you picked,
  with four quick asks (less cliché, more in character, shorter, show don't tell) and a box for
  your own. **Rewrite this part** sends the whole reply to the chat's own model with only that
  passage marked, and the model is told to change nothing else, match the point of view, tense,
  voice and formatting either side of it, keep about the same length, and never speak or act for
  your character unless the original did. The rewrite is shown next to the original; **Use it**
  splices it in through the normal message edit, **Try again** asks for another. Nothing is saved
  until you say so, and if the reply changed while you were deciding, it refuses rather than
  splicing into the wrong place.
- **The passage is found in the reply as stored, not as shown.** The screen shows rendered
  markdown, so a picked passage has no asterisks and may have curly quotes where the stored text
  has straight ones; both are reduced the same way and matched back. Bold or italics that open or
  close at the edge of the passage come with it when that keeps them paired, so a fix never leaves
  a stray asterisk. A passage the stored text does not contain at all (a display-only regex
  rewrote it) is refused with a message rather than guessed.
- **The slop highlighter.** Phrases from your slop list get a soft orange wash and a wavy
  underline in every reply. They are drawn by the browser over the text, so the message itself is
  never changed and copying it copies plain text. **Tap a marked phrase** and Fix this part opens
  on its whole sentence. The list starts with fifty-odd of the usual offenders (a shiver down her
  spine, barely above a whisper, the air was thick with, ministrations...) and is yours to edit
  from the **Slop** button above the message box, one phrase per line, with a switch to turn the
  marks off and a reset back to the starter list. Every rewrite is told to avoid the whole list.
  The list is a browser preference, kept in its own small store rather than in Marinara's
  settings. Marks need a browser with the CSS Custom Highlight API (current Chrome, Safari and
  Firefox); without it there are simply no marks.
- **Fix this part and the Director use the same model the story does**, resolved in one shared
  helper, and Fix this part logs its prompt in debug mode.

### The tidy row and the tracker cards

- **One row above the message box.** The in-scene strip, Board, People, Director, Spark, Push story,
  Encounter and Slop used to stack in two or three rows. They are now pills in one row that scrolls
  sideways when it runs out of width. The pictures the AI is seeing ride on the **Board** pill as a
  little stack of up to three, so they no longer need a row of their own, and Slop is an icon at the
  end. Icons take the theme's accent colour, so the row turns sapphire under Sapphire Nocturne.
- **"Add to lorebook" can be switched off.** The Slop panel has a switch for it. With it off, a
  selection offers only **Fix this part**, which moves up into its place.
- **Tracker cards (Option A).** A present character is a card now instead of a cramped two-column
  table: a portrait ring, the mood as a pill, the thought as a bubble, then labelled **Wearing** and
  **Looks** rows that wrap instead of cutting off, then the stats as bars with a word beside the
  number ("wary 45"). Cards take the full width of the panel. Everything is still tap to edit. The
  add, delete, hide and lock modes switch back to Marinara's own card, which carries every control
  for them.
- **Persona stats are rings with a word under each** ("steady", "low"), whatever the stat display
  setting says, since that is what Option A showed.

## Upstream files touched

Fork-only code lives in `packages/client/src/lib/fork/`, `Fork*` components, `packages/server/src/services/import/fork/`
and `scripts/regressions/fork-*.regression.ts`.
Edits to upstream files are marked with a `Fork:` comment.

| File | Why |
| --- | --- |
| `packages/client/src/components/chat/ChatArea.tsx` | Edit & resend handler and props |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx` | Passes Edit & resend to the right message |
| `packages/client/src/components/chat/ChatMessage.tsx` | Resend button in the message editor |
| `packages/client/src/localization/locales/en.json` | Two strings for the resend button |
| `packages/client/src/components/agents/AgentEditor.tsx` | Offers the fork tracker result to custom agents |
| `packages/server/src/services/agents/agent-executor.ts` | Shows the tracker agent what the tracker holds |
| `packages/client/src/lib/custom-agent-result-examples.ts` | The JSON example for that result |
| `packages/client/src/components/chat/CyoaChoices.tsx` | Re-roll reruns the agent that made the choices |
| `packages/client/src/components/chat/ChatInput.tsx` | Spark button |
| `packages/client/src/hooks/use-generate.ts` | Choice results from any choice agent reach the choice bar |
| `packages/client/src/components/modals/ImportPresetModal.tsx` | Update-or-copy prompt on preset import |
| `packages/server/src/services/import/marinara.importer.ts` | Preset update in place, regex pack install |
| `packages/server/src/routes/prompts.routes.ts` | Preset export carries its regex pack |
| `packages/server/src/app.ts` | Registers the board and tracker tables at startup |
| `packages/server/src/db/connection.ts` | `registerForkTables` helper |
| `packages/server/src/routes/index.ts` | Registers the board and Director routes |
| `packages/server/src/routes/generate.routes.ts` | Sends in-scene pins, their captions and the bonds note with the reply |
| `packages/client/src/components/chat/ForkBoardStrip.tsx` | Bonds button too |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx` | Mounts Fix this part and the slop highlighter; passes the date to the weather |
| `packages/server/src/routes/index.ts` | Registers the Fix this part route |
| `packages/client/src/components/chat/CyoaChoices.tsx` | Readable controls and choices |
| `packages/server/src/services/storage/chats.storage.ts` | Clears a chat's board and bonds when it, or its whole branch group, goes |
| `packages/server/src/services/storage/characters.storage.ts` | Clears the persona's board when a persona goes |
| `packages/client/src/lib/weather-renderer.ts` | Batched rain drawing |
| `packages/client/src/workers/weather-effects.worker.ts` | Draws the field in one pass, no per-particle allocation |
| `packages/client/src/components/chat/WeatherEffects.tsx` | Same, on the non-worker path; passes the date for seasons |
| `packages/client/src/lib/weather-renderer.ts` | New weather kinds, the weather rules, seasons, shared particle step |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx` | In-scene strip |
| `packages/client/src/components/chat/ChatInput.tsx` | Director button (and the Spark button) |
| `packages/server/src/routes/generate.routes.ts` | Saves which agent made the choices |
| `packages/server/src/routes/generate/retry-agents-route.ts` | Same, for re-rolled choices |
| `packages/shared/src/schemas/lorebook.schema.ts` | Whole-word default |
| `packages/server/src/services/storage/lorebooks.storage.ts` | Whole-word default |
| `packages/server/src/routes/chats.routes.ts` | A branch copies the board and the bonds |
| `packages/client/src/components/chat/ChatInput.tsx` | The action row is one scrolling row of pills, led by the fork's own buttons |
| `packages/client/src/components/chat/ChatArea.tsx` | Hides "Add to lorebook" when it is switched off |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx` | Hands the board pills to the action row instead of its own strip |
| `packages/client/src/features/tracker-panel/components/sections/CharacterTrackerPanel.tsx` | Option A cards, one per row |
| `packages/client/src/features/tracker-panel/components/sections/PersonaInventoryPanel.tsx` | Persona stats always as rings |
| `packages/client/src/features/tracker-panel/components/controls/StatGauge.tsx` | A word under each ring |

## Known upstream issue kept as is

Preset conditions like `{{#if custom_toggles contains "VOICE"}}` match partial text, so `VOICE` also matches
`VOICE2`. Changing `contains` would change every other preset and lorebook condition, and presets shared with
regular Marinara users have to work there too, so the fork keeps upstream behavior. Write conditions with
`not contains` guards, or report it upstream.
