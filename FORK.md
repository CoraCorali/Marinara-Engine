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

### The relationship tracker, Pura-style

The tracker is rebuilt as a dating sim told in words, after Pura's Relationship Tracker, and the two
meters per bond are gone.

- **A love interest follows Pura's route.** A rung on the warm ladder (Stranger, Noticed,
  Acquaintance, Familiar, Friendly, Close, Confidant, Intimate, Devoted), the cold one (Wary, Guarded,
  Resentful, Hostile, Nemesis) or a tangled state (Complicated, Codependent, Estranged, Rivals,
  Frenemies, Unrequited, Forbidden). Then a route (🌱 Slow Burn, 🩹 Second Chance...), a condition
  (💛 SHIFTING, ⚡ VOLATILE...), a drift (🌅 WARMING, 🍂 COOLING...), and heart, trust, wants, guard,
  likes, dislikes, tell, unsaid, memory, date idea, what moved them, and what would move them next.
- **Status is separate from feelings.** Talking, dating, together, living together, engaged and
  married stay as their own row of pills, so a husband can still be Guarded and cooling.
- **Every other kind has its own ladder and fields** in the same card style. Family: Estranged to
  Close, with role, old wound, what they expect of you and how they protect you. Friend:
  Acquaintance to Ride-or-die, with the vibe, an inside joke, favours owed and a hangout idea.
  Rival: Annoyance to Nemesis, or across to Grudging respect, with what they respect, the grudge,
  what they want to beat you at and the weakness they have spotted. Ex: Bitter to Rekindling, with
  why it ended, what still pulls and what still hurts. Nobody but a love interest is asked for a
  date idea.
- **The cards** take the theme's accent: a portrait ring, a header with the rung, condition and
  drift, a route banner, route progress pills (the rung below, the current one, the locked one
  above), four colour-coded mini cards, then the rest of the fields. Every field is editable and
  saves a moment after you stop typing.
- **Moments.** Each time a bond moves a rung or a status, by the agent or by hand, it is kept on
  that person's card as "Close → Confidant" with what happened (the scene's turn, or a line you
  write). Branches keep the moments so far; deleting a chat or a bond clears them.
- **The agent moves things carefully.** One rung per scene on the same ladder. Onto another ladder
  it lands on that ladder's first rung, so falling out with someone Devoted makes them Wary, not a
  Nemesis overnight; a tangled state can be named directly. A status moves one step. When a rung
  rises the drift becomes 💗 HEART EVENT and when it falls 🥀 FALLING OUT, whatever the agent said.
  A field it leaves out or sends empty is never cleared, a field the kind does not have is
  dropped, and a made-up kind, rung or condition is ignored.
- **The agent always gets today's format.** The full spec (every ladder, field, condition and drift)
  is built on the server from one shared list and sent with every run, so an agent made by the first
  version answers in the new shape too. Its old prompt is also replaced the next time the People
  panel opens.
- **What the writer is told** is words only: each person's kind, status, route, rung, condition and
  drift, then the fields that matter for writing them. The keepsake memory, the date idea and the
  scene's turn stay on the card.
- **Old bonds keep their note**, which becomes the heart of the card. Their two numbers are no longer
  used.

### Fix this part as a sheet, Slop chips, a polaroid board, and Pin from chat

- **Fix this part opens as a sheet from the bottom** instead of a full screen, so the reply stays in
  view above it. The passage you picked glows in place in the reply (theme accent, drawn by the
  browser over the text, so the message is untouched), and the reply scrolls up so it sits above
  the sheet. Once there is a rewrite, a **Before / After** toggle shows the original or the new
  version in the same spot. The quick asks are a sideways-scrolling row of chips that light up
  when picked. Escape or the × closes it.
- **The Slop list is chips.** Each phrase is a chip with its own ×, there is an add box at the
  top, and a line says how many phrases from the list are in the newest reply. Those phrases' chips
  glow orange, so you can see what the model is actually leaning on. The switches for the
  highlighter and "Add to lorebook" stay at the top.
- **The reference board is polaroids**: a cream frame, a square photo, the caption written under it
  in italic serif, a strip of tape in the theme colour on pins that are in scene, and a slight tilt
  either way. Pins that are not in scene fade. A **sort** menu offers my order, in scene first, by
  category and newest first. In "my order", the grip handle on each polaroid drags it to a new
  place with a finger or a mouse, and moves it with the arrow keys too. The dragged order stays on
  screen until every save lands.
- **Pin from chat.** Open any picture in a Roleplay chat (an illustration, a selfie, an attachment)
  and a **Board** button beside Marinara's own pin and download buttons puts it on that roleplay's
  reference board. It shares the board's size and type limits, and says so if a picture is refused.

### The weather panel and weather sounds

A **Weather** pill in the row above the message box opens a panel for the roleplay's weather. Its
choices are remembered per chat in the browser; the sound switches are one preference for all chats.

- **Follow the story or pick it yourself**: clear, drizzle, rain, downpour, thunderstorm, snow,
  blizzard, fog, windy, autumn leaves, petals, aurora, embers or a sandstorm. A pick is the line the
  tracker would have written, so it draws exactly like story weather. The **time of day** can follow
  the story or be set to dawn, day, dusk or night.
- **Sliders** for amount, speed, size, opacity and brightness, and a colour **tint** laid softly over
  the scene. Amount scales every layer but never switches one off. Opacity, brightness and tint are
  applied by the browser to the canvas, so they cost no drawing. The sliders save when you let go,
  since a weather canvas can only be handed to its background worker once and each change makes a
  new one.
- **Sky**: a starry night with the odd shooting star (two of them, each waiting a while between
  crossings), aurora ribbons over any weather, and the sun and moon following the hour, hidden, or
  placed by hand.
- **Weather sounds**, made in the browser with no audio files: rain whose loudness follows drizzle
  through downpour, wind for windy weather, snow and sand, thunder now and then in a storm, and a
  fireplace crackle for embers or whenever its own switch is on. Everything fades rather than
  switching, there is a volume slider, and sound pauses while the tab is hidden. Browsers keep audio
  silent until the page is touched, so it starts with your first tap.

### LinkAPI fixes, and regexes that wait for a reply to finish

Tested against LinkAPI itself with small requests. What it does with Gemini 3.5 Flash through its
OpenAI-compatible endpoint: streaming works and thinking stays hidden, but the thinking counts
against Max Tokens, and neither `reasoning_effort: low`, `thinkingBudget` nor the model-name
suffixes turn it down (only "minimal" switches it off). A 300-token budget came back as about 287
tokens of thinking and a reply cut off mid-sentence.

- **A reply cut short by thinking says so.** When a reply stops at the output limit and hidden
  thinking used most of it, a warning names the numbers ("287 of its 296 output tokens thinking")
  and says to raise Max Tokens or turn reasoning down. Marinara already explained a reply that came
  back empty; this is the one that came back short.
- **A leaked plan goes to the thinking box.** FF5 asks the model to think through "Task 0" to
  "Task 10" before writing, and Gemini sometimes writes that plan into the reply. When a reply opens
  with Task 0 (or Task 1), the plan up to the first blank line after its last task heading is
  lifted into the thinking box and the reply starts at the prose. It is narrow on purpose: a plan
  in the middle of a reply, prose that mentions a task, or a reply that would be left empty is left
  alone.
- **Blocked replies are named as blocked** (content filter, safety, prohibited content and the
  like), with what to try next, instead of "returned an empty response".
- **Try again.** A reply that failed shows **Try again** on its error. A message of yours the
  server already saved is not sent twice; one it never saved is sent again.
- **A backup model** was already in Marinara: Connections, then Defaults and fallbacks, then a
  **Fallback** for Main. When the main connection fails before writing anything (LinkAPI busy, a
  model with no channel), the fallback connection takes the turn. A second LinkAPI connection with
  another model works as the fallback.
- **Regexes can wait until the reply is finished.** A regex script has a **Wait until the reply is
  finished** checkbox in its editor. While a reply streams in, those scripts are skipped, so a check
  for something that only comes at the end (like a "this reply was cut off" warning) no longer
  flashes on every half-written reply. Saved per script in the browser, so the regex table itself is
  unchanged.

### The Director's chair, dressed for the set

- **Prettier bubbles.** Your lines are rounded bubbles in a soft theme-accent gradient; the
  Director's answers sit beside a little clapperboard avatar, and both keep their line breaks.
- **The note is a film slate**: a striped clapper bar across the top, then a dark board with the
  direction chalked on in a typewriter face, "Take 2" counting the Director's answers, and
  **Rewrite reply** and **Save for next** underneath. The slate grows with the note.

### Bug pass over everything

A full review of every fork feature, with a test for each fix that has logic in it.

- **Swiping a reply no longer stacks relationship moves.** Each reply's tracker run is remembered,
  and a swipe or re-roll of that reply takes it back before stepping again, along with its moments.
  Three swipes of one reply move a bond one rung, not three. A value is only put back while it still
  holds what that run left, so a later reply or a change made by hand is never undone.
- **Leaving a tangled state lands where it is named.** A marriage that went "Complicated" and then
  back to "Devoted" no longer drops to Stranger.
- **Old bonds keep their place.** A bond from the first version takes its rung from its old stage
  (a husband reopens Devoted, not Stranger) or from its old closeness meter, and that rung is written
  down on its first edit, so a status change does not move it.
- **The agent's words are read without caring about case** ("Love", "MARRIED"), and people who are
  not cards keep separate ids even when their names are in Japanese or Cyrillic.
- **Generation no longer depends on startup order.** The fork's tables are registered when storage
  opens rather than in app startup, so nothing that opens storage can fail with "Unsupported table".
- **Updating a preset keeps scripts you wrote for it.** Only scripts with the same name as one in the
  new file's pack are replaced, and a file with no pack leaves the preset's scripts alone.
- **Try again** is not offered once part of the run was saved (it would add a second reply), and on
  a turn with a map move it now generates the reply instead of quietly doing nothing.
- **Wait until the reply is finished** works in Conversation mode too.
- **Stars and fireflies are drawn at all.** They were born with no opacity, and the renderer skips
  anything invisible, so the night sky and the Stars switch only ever showed the shooting stars.
- **The weather no longer falls back to the slower renderer** after tapping a chip that is already
  picked: the drawing and its canvas now follow one key. Tint, opacity and brightness no longer
  rebuild the canvas at all.
- **Weather sounds**: crackles and thunder no longer pile up into one loud pop when audio wakes, the
  sound keeps playing when the weather canvas appears or goes, and a key press or a lifted finger
  wakes it as well as a touch.
- **Fix this part** edits the copy you picked when the same words appear twice, keeps its markers on
  a very long reply, closes with the phone's back button, and ignores Escape meant for typing or for
  a dialog on top. Slop phrases typed with a phone's curly apostrophe now match.
- **The board**: Newest goes by when a pin was added, quick arrow-key moves build on each other, and a
  second drag before the first save lands is no longer snapped back.
- **Re-roll after Scene Spark on a new chat** asks Spark again, not the official choice agent.
- **The Director** skips messages you hid from the AI, and a failed model call is logged and answered with
  a clear error. **Pin from chat** says plainly when it could not read a picture.
- Smaller: the moments list shows status names, the bond ring has a plain-colour fallback, tracker
  card rows keep their own keys.

### UI pass, and the prompts checked end to end

Every fork panel was walked through at phone width with a navy theme, and every feature that talks
to a model was traced from its prompt to what is done with the answer.

- **Every model feature has a working prompt**: the relationship tracker agent, the Director and Fix
  this part each carry their own, and what comes back is read and applied. Scene Spark is the one
  that needs an agent you make yourself; the Spark button appears once an active custom agent gives
  Interactive Choices.
- **The relationship and board note goes before a preset's assistant prefill**, so the prefill stays
  the last turn. Pushed after it, the model started a fresh reply and the prefill was glued on front.
- **A swipe is told where things stood before the reply it replaces**, both the writer and the
  tracker agent. Before, the agent saw the old swipe's move, reported no change, and the undo then
  took the move away with nothing put back.
- **The Director sees its current note**, so a note you edited by hand is kept rather than
  overwritten by its next answer, and an answer with only a note shows the note, not raw JSON.
- **A save that fails says so.** Captions, categories, in-scene, bond fields and moments used to
  snap back silently.
- **Confirm before** resetting the slop list, starting the Director over, or removing a moment you
  wrote up.
- **The People and Director panels use the whole phone screen** instead of a small inner window.
- **Theme colours**: on/off settings are pill switches, the Director's slate takes the theme's tint,
  an armed Push story lights up in the accent, Scene Spark's choice chips are readable, the board's
  delete icon uses the theme's destructive colour, and Edit & resend uses the accent.
- **Fits a phone**: route-bar rung names wrap instead of cutting off, the board's tabs and Pin button
  stay on one line, tap targets are at least 40px, and no text is under 11px.
- **Small things**: the pill row fades at its edge so more pills look swipeable, a person you add opens
  and scrolls into view, tapping another mark no longer throws away a rewrite waiting to be used,
  tracker cards no longer make the list jump, and Fix this part respects reduced motion and the
  app's safe-area inset.
- **Two upstream regressions updated** for earlier fork changes: the agent result list now ends with
  the tracker's result, and the weather repaint test knows the field is built by one shared helper.

### Your feedback, built: smaller, linked up, and between the characters

- **Smaller everywhere**: the pill row's buttons and icons are smaller with less gap, panel rows are
  tighter, and the long explanations moved behind a ? like the rest of Marinara. Text fields keep
  their size on a phone (`styles/fork.css`) instead of jumping to 16px.
- **Scene Spark can be put away**: choices are compact cards that open with a chevron, and a ✕ puts
  them away for good (Re-roll still gets new ones).
- **The weather panel and the world state are one weather**: the panel shows what the story says
  now, its chips write the world state, and "Keep it this way" locks the weather and time so the
  tracker leaves them alone. The tracker's weather tile opens the panel.
- **Theme effect switches**: a theme can name its effects in CSS comments
  (`/* @fork-effect id | label | roleplay|everywhere | on|off */`); the weather panel lists them as
  switches and `<html data-fork-fx-off>` turns the ones you switch off off.
- **The board knows who wears what**: a wearing pin says who (you, a character, or nobody in the
  scene), which slot (full outfit, top, shoes, hair, makeup, nails, bag…) and whether the picture is
  on a model or just the clothes. A new outfit takes the old one out of the scene; shoes replace
  shoes. Describe it writes the caption from the picture.
- **A message that mentions a pin sends its picture** with that reply ("the blue sundress she
  likes"), replacing what it conflicts with for that reply only. The model is told to keep each
  person's own body and only take the clothes from a picture.
- **Outfits follow the board**: changing who wears what updates the tracker's outfit line, and when
  the tracker's outfit changes the app asks whether to take the pin out of the scene.
- **The persona card**: who you are today, what you are wearing (from the board), where you are,
  who you are closest to, your stats as rings with a word, and what you are holding. Each line opens
  where it comes from. It is in the Tracker Panel and the phone's Player & Tracker popup, with an
  Edit stats button for Marinara's own editor.
- **Between the characters**: People keeps how two characters stand with each other: a kind, a rung
  on its ladder, and a line for each side. The tracker agent reports these too, one rung per scene;
  swipes undo them; the writer and the Director read them.
- **Relationships in the tracker**: a compact list of bonds and pairs in the Tracker Panel and the
  Player & Tracker popup, in place of the downloadable Relationship Tracker. People shows a banner to
  switch that one off when it is still on.

### Final check

- **Fixed after review**: a caption with a small word in it ("dress with lace") is found when typed
  out; a chat outfit covers your always-on persona-board outfit, so the model is never told two;
  undoing a pair's change of kind brings back its rung; a pair that changes kind takes the named
  rung; removing a pair that is gone says so; Relationships and Closest refresh after every reply;
  the tracker panel keeps Marinara's persona block when no persona is attached; love statuses show
  as words; outfit sync no longer overwrites one character with another or a stale list; putting
  choices away cannot bring them back; the weather tile button gets out of the way in lock mode;
  and the ? buttons and Open People are easier to tap.
- **Live tests with Opus 4.6, Opus 5.5 and Fable 5.1 through LinkAPI**: Describe it named the
  pieces and told a flat-lay from an outfit on a model, without describing anyone's body; a hair
  close-up now gets a hair-only caption (it used to list the jewelry and top in the shot too). A
  message mentioning the navy outfit sent its picture, and the replies used it on Kyli's own curvy
  build and the hair pin's curls.
- **`fork` is a reserved chat-metadata namespace** (`forkPersonaToday`), so a package cannot take it;
  the upstream check for this now passes.
- **Regressions**: 538 of 540 passed in the full run. The capability check failed on the metadata
  namespace and now passes. `ruleset-combat-director` passes its checks but sits about 23 seconds
  before exiting, the same on untouched upstream code, so it can hit the 30-second limit on a slow
  machine.

### The closet, what changed lately, and milestones

- **👗 Closet** (a third tab on the board): saved outfits that work in every chat. Save a look
  someone has on, save one pin from its editor, or start a new outfit from pictures. Tap **Wear** to
  put it on you or a character in this chat: its pieces join the chat's board in scene, the whole
  outfit first, and the board's usual rule takes out what they replace. Closet pieces are board pins
  in their own `outfit` scope with their own copies of the pictures, so deleting a chat never empties
  the closet and deleting an outfit never touches a chat wearing it. A piece keeps Describe it.
- **What changed lately**: each reply's tracker turn is read back, so the writer gets "What changed
  lately" (newest first, the last twelve replies) and the Relationships rows show "↑ Intimate · last
  reply" for a couple of replies after a move. People refreshes after every reply.
- **Milestones**: a step up a warm ladder, or a romance's next status, is a milestone. The Director
  is told about fresh ones and shows a chip ("💞 Theo reached Intimate. Ideas?") that asks it for a
  small beat that lets the story notice it, never forced.
- **Weather sounds**: the Sounds switch moved near the top of the weather panel, sounds swell in and
  fade out instead of stopping, and the help says a clear sky is quiet and an iPhone's silent switch
  mutes them. A browser test confirmed they play once the page is touched.

### Whole-engine bug sweep

Six read-only reviews (reply pipeline, saved data and imports, chat screen, panels and editors,
agents and trackers, security) were checked against the code; these were real and are fixed:

- **Replies through a proxy**: an error a gateway sends mid-stream (an error chunk that still has
  choices, or `finish_reason: "error"`) now fails the reply instead of saving a cut-off one as a
  success. Stop only calls KoboldCpp's abort endpoint on a local backend, without waiting on it.
- **Prefill**: macros in a preset's prefill (`{{char}}`) are resolved; Continue no longer sends the
  prefill again or writes it into the middle of the message.
- **Trackers**: an agent reply cut off at the token limit is retried instead of being repaired into
  a shortened "complete" list (which deleted characters and fields); `recentEvents` is text-only and
  capped at 20; Retry agents patches the map keys rather than rewriting all chat metadata; your
  locks, hidden fields and edits to untouched fields survive an agent update arriving.
- **Editors**: the regex editor saves before you leave it; preset option and section fields keep an
  edit made just before collapsing or closing; fast option edits no longer undo each other; a stale
  section reorder keeps sections it did not list instead of dropping them from the prompt.
- **Chat screen**: tapping a `<summary>` no longer toggles the message bar or opens the editor on a
  double tap; `<details open>` stays open; Enter during IME composition does not send; Send/Stop
  and quest objective controls have labels and touch-sized hit areas; tracker section buttons are
  bigger on touch; a message with damaged extra data still renders.
- **Imports**: updating a preset in place refuses a damaged file before touching anything and only
  removes the old rows once the new ones are written; a chat re-imported from another install no
  longer points messages at characters that do not exist; a SillyTavern card's lorebook keeps its
  depth, role, position, probability, groups, timed effects and recursion settings; a preset regex
  pattern that starts and ends with "/" round-trips intact.
- **Fork data**: closet pieces keep their scope (Describe it works on them); a closet save that fails
  part-way is rolled back and Wear checks the chat exists; deleting a character clears its bonds and
  pairs; deleting a reply takes back its relationship tracker run; a persona's board is cleared only
  after the persona delete succeeds.
- **New regressions**: `fork-stream-error`, `fork-st-book-extensions`, plus cases in
  `fork-bonds`, `fork-preset-update` and `fork-reference-board`.

Left as they are, with the reason:

- A regenerated swipe's trackers start from the previous swipe's row: upstream does this on purpose
  in two places (see the ruleset live-sheet comment); worth raising upstream rather than guessing.
- Character-scoped regex scripts run over the whole assembled prompt on a fresh send in a
  single-character chat; the fix changes how every prompt is targeted, so it belongs upstream.
- The client keeps the last quest when a patch sends an empty quest list: that guard stops other
  trackers wiping quests.
- Profile export leaves out the fork's tables (a full data-folder backup includes them); a branch
  copies relationships as they are now rather than as of the branch point; a preset's regex pack
  replaces a same-named script of yours that targets only that preset.

## Upstream files touched

Fork-only code lives in `packages/client/src/lib/fork/`, `Fork*` components, `packages/shared/src/features/fork-bond-shapes.ts`, `packages/server/src/services/import/fork/`
and `scripts/regressions/fork-*.regression.ts`.
Edits to upstream files are marked with a `Fork:` comment.

| File                                                                                       | Why                                                                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `packages/client/src/components/chat/ChatArea.tsx`                                         | Edit & resend handler and props                                                                   |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx`                              | Passes Edit & resend to the right message                                                         |
| `packages/client/src/components/chat/ChatMessage.tsx`                                      | Resend button in the message editor                                                               |
| `packages/client/src/localization/locales/en.json`                                         | Two strings for the resend button                                                                 |
| `packages/client/src/components/agents/AgentEditor.tsx`                                    | Offers the fork tracker result to custom agents                                                   |
| `packages/server/src/services/agents/agent-executor.ts`                                    | Shows the tracker agent what the tracker holds                                                    |
| `packages/client/src/lib/custom-agent-result-examples.ts`                                  | The JSON example for that result                                                                  |
| `packages/client/src/components/chat/CyoaChoices.tsx`                                      | Re-roll reruns the agent that made the choices                                                    |
| `packages/client/src/components/chat/ChatInput.tsx`                                        | Spark button                                                                                      |
| `packages/client/src/hooks/use-generate.ts`                                                | Choice results from any choice agent reach the choice bar                                         |
| `packages/client/src/components/modals/ImportPresetModal.tsx`                              | Update-or-copy prompt on preset import                                                            |
| `packages/server/src/services/import/marinara.importer.ts`                                 | Preset update in place, regex pack install                                                        |
| `packages/server/src/routes/prompts.routes.ts`                                             | Preset export carries its regex pack                                                              |
| `packages/server/src/db/connection.ts`                                                     | Registers the fork's tables (`db/fork-tables.ts`) when storage opens; `registerForkTables` helper |
| `packages/server/src/routes/index.ts`                                                      | Registers the board and Director routes                                                           |
| `packages/server/src/routes/generate.routes.ts`                                            | Sends in-scene pins, their captions and the bonds note with the reply                             |
| `packages/client/src/components/chat/ForkBoardStrip.tsx`                                   | Bonds button too                                                                                  |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx`                              | Mounts Fix this part and the slop highlighter; passes the date to the weather                     |
| `packages/server/src/routes/index.ts`                                                      | Registers the Fix this part route                                                                 |
| `packages/client/src/components/chat/CyoaChoices.tsx`                                      | Readable controls and choices                                                                     |
| `packages/server/src/services/storage/chats.storage.ts`                                    | Clears a chat's board and bonds when it, or its whole branch group, goes                          |
| `packages/server/src/services/storage/characters.storage.ts`                               | Clears the persona's board when a persona goes                                                    |
| `packages/client/src/lib/weather-renderer.ts`                                              | Batched rain drawing                                                                              |
| `packages/client/src/workers/weather-effects.worker.ts`                                    | Draws the field in one pass, no per-particle allocation                                           |
| `packages/client/src/components/chat/WeatherEffects.tsx`                                   | Same, on the non-worker path; passes the date for seasons                                         |
| `packages/client/src/lib/weather-renderer.ts`                                              | New weather kinds, the weather rules, seasons, shared particle step                               |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx`                              | In-scene strip                                                                                    |
| `packages/client/src/components/chat/ChatInput.tsx`                                        | Director button (and the Spark button)                                                            |
| `packages/server/src/routes/generate.routes.ts`                                            | Saves which agent made the choices                                                                |
| `packages/server/src/routes/generate/retry-agents-route.ts`                                | Same, for re-rolled choices                                                                       |
| `packages/shared/src/schemas/lorebook.schema.ts`                                           | Whole-word default                                                                                |
| `packages/server/src/services/storage/lorebooks.storage.ts`                                | Whole-word default                                                                                |
| `packages/server/src/routes/chats.routes.ts`                                               | A branch copies the board and the bonds                                                           |
| `packages/client/src/components/chat/ChatInput.tsx`                                        | The action row is one scrolling row of pills, led by the fork's own buttons                       |
| `packages/client/src/components/chat/ChatArea.tsx`                                         | Hides "Add to lorebook" when it is switched off                                                   |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx`                              | Hands the board pills to the action row instead of its own strip                                  |
| `packages/client/src/features/tracker-panel/components/sections/CharacterTrackerPanel.tsx` | Option A cards, one per row                                                                       |
| `packages/client/src/features/tracker-panel/components/sections/PersonaInventoryPanel.tsx` | Persona stats always as rings                                                                     |
| `packages/client/src/features/tracker-panel/components/controls/StatGauge.tsx`             | A word under each ring                                                                            |
| `packages/shared/src/index.ts`                                                             | Exports the relationship tracker's shapes                                                         |
| `packages/client/src/components/chat/ChatImageLightbox.tsx`                                | Pin from chat button in the image viewer                                                          |
| `packages/client/src/components/chat/WeatherEffects.tsx`                                   | Weather panel tuning, tint and sounds                                                             |
| `packages/client/src/workers/weather-effects.worker.ts`                                    | Weather panel speed, size and sun position                                                        |
| `packages/client/src/lib/weather-renderer.ts`                                              | Shooting stars, size scaling, sun position override                                               |
| `packages/client/src/components/chat/ChatRoleplaySurface.tsx`                              | Feeds the weather panel's picks to the weather                                                    |
| `packages/server/src/routes/generate.routes.ts`                                            | Lifts a leaked Task plan into thinking; notices a reply cut short by thinking                     |
| `packages/server/src/services/generation/empty-response-reason.ts`                         | Names a blocked reply as blocked                                                                  |
| `packages/client/src/hooks/use-generate.ts`                                                | Try again on a failed reply; the cut-short warning                                                |
| `packages/client/src/hooks/use-apply-regex.ts`                                             | Skips scripts that wait for a reply to finish                                                     |
| `packages/client/src/components/chat/ChatMessage.tsx`                                      | Passes those scripts while a reply streams                                                        |
| `packages/client/src/components/agents/RegexScriptEditor.tsx`                              | The wait-until-finished checkbox                                                                  |
| `packages/client/src/components/chat/ChatArea.tsx`                                         | Passes portraits to the People panel                                                              |
| `packages/client/src/components/chat/ConversationMessage.tsx`                              | Wait-until-finished regex in Conversation mode                                                    |
| `packages/client/src/components/chat/ChatArea.tsx`                                         | The Director's dialog lets the panel fill a phone screen                                          |
| `scripts/regressions/agent-runtime.regression.ts`                                          | Expects the tracker's result type at the end of the list                                          |
| `scripts/regressions/weather-effects-suspended-repaint.regression.ts`                      | Knows the shared field helper                                                                     |
| `packages/client/src/stores/agent.store.ts`                                                | Remembers which choice agent made the choices on screen                                           |
| `packages/server/src/routes/generate/retry-agents-route.ts`                                | Passes the reply to the tracker update, so a re-roll replaces its move                            |
| `packages/client/src/components/chat/RoleplayHUDPanels.tsx`                                | Persona card, Edit stats and Relationships in the Player & Tracker popup                          |
| `packages/client/src/features/tracker-panel/components/TrackerSectionList.tsx`             | Persona card and the Relationships section                                                        |
| `packages/client/src/features/tracker-panel/components/sections/PersonaInventoryPanel.tsx` | Shows the persona card, with Edit stats for the stat editor                                       |
| `packages/client/src/features/tracker-panel/components/sections/WorldForecastTile.tsx`     | Opens the weather panel                                                                           |
| `packages/client/src/components/layout/CustomThemeInjector.tsx`                            | Mounts the theme effect switches                                                                  |
| `packages/client/src/main.tsx`                                                             | Loads `styles/fork.css`                                                                           |
| `packages/client/src/components/chat/ChatArea.tsx`                                         | Opens fork panels from the tracker; passes the persona and cast to the board                      |
| `packages/client/src/components/chat/CyoaChoices.tsx`                                      | Compact choices that open, and a ✕ to put them away                                               |
| `packages/client/src/hooks/use-generate.ts`                                                | Re-reads People after each reply                                                                  |
| `packages/server/src/services/generation/lorebook-image-prompt.ts`                         | Optional heading for the board's pictures                                                         |
| `packages/server/src/routes/generate.routes.ts`                                            | Mentioned pins, names, the persona's today line and the pairs note                                |
| `packages/shared/src/schemas/gm-verb-table.schema.ts`                                      | Reserves the `fork` chat-metadata namespace                                                       |
| `packages/server/src/routes/index.ts`                                                      | Registers the closet routes                                                                       |
| `packages/client/src/components/chat/ChatArea.tsx`                                         | Names for the Director's milestone chips                                                          |
| `packages/server/src/services/llm/providers/openai.provider.ts`                            | Mid-stream gateway errors fail the reply                                                          |
| `packages/server/src/services/agents/agent-executor.ts`                                    | A truncated agent reply is retried, not repaired                                                  |
| `packages/server/src/routes/generate/retry-agents-route.ts`                                | Patches map keys instead of rewriting metadata                                                    |
| `packages/server/src/routes/prompts.routes.ts`                                             | Section reorder keeps unlisted sections                                                           |
| `packages/server/src/services/import/st-chat.importer.ts`                                  | Exported character ids are checked                                                                |
| `packages/server/src/services/import/st-lorebook.importer.ts`                              | V2 character_book extensions                                                                      |
| `packages/server/src/services/storage/characters.storage.ts`                               | Character delete clears bonds and pairs; persona board after the delete                           |
| `packages/server/src/services/storage/chats.storage.ts`                                    | Reply delete takes back its relationship run                                                      |
| `packages/client/src/components/chat/ChatMessage.tsx`                                      | Summary taps, damaged extra data                                                                  |
| `packages/client/src/lib/chat-html.ts`                                                     | Allows `open` on `<details>`                                                                      |
| `packages/client/src/components/chat/ChatInput.tsx`                                        | IME Enter, Send/Stop label                                                                        |
| `packages/client/src/hooks/use-game-state-patcher.ts`                                      | Agent updates keep locks and untouched edits                                                      |
| `packages/client/src/components/agents/RegexScriptEditor.tsx`                              | Saves before leaving                                                                              |
| `packages/client/src/components/presets/PresetEditor.tsx`                                  | Option and section edits are not lost                                                             |
| `packages/client/src/features/tracker-panel/components/controls/SectionControls.tsx`       | Bigger buttons on touch                                                                           |

## Known upstream issue kept as is

Preset conditions like `{{#if custom_toggles contains "VOICE"}}` match partial text, so `VOICE` also matches
`VOICE2`. Changing `contains` would change every other preset and lorebook condition, and presets shared with
regular Marinara users have to work there too, so the fork keeps upstream behavior. Write conditions with
`not contains` guards, or report it upstream.
