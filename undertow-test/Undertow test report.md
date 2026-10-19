# Undertow 2.0 test report

Tested on 19 October 2026. NEW preset vs OLD (before Oct 19), on Claude Fable 5.1, Opus 4.6 and Opus 5.5.

**Read this first: this is a partial test.** The plan was 140 replies across 10 scenarios. I stopped the run after 15 replies to protect your LinkAPI credit (Opus 5.5 alone would have cost about $57 before your group's multiplier). Only two scenarios have replies, both with Elias. Everything below is honest about that: treat it as an early read, not a verdict.

## 1. Summary

**Verdict:** on the two scenarios tested, NEW is clearly better than OLD. NEW averaged **4.4 out of 5** across the eight scores, OLD **3.7**. The biggest gains are pacing, keeping Kyli to the Player, and the margin notes actually steering the story.

**Most important findings**

1. **The pacing fix works.** `elias_cat_turn2` is the exact spot where OLD used to finish the argument and walk out. With NEW, all 6 replies (Fable and Opus 4.6) stayed in the bed, in one beat, and ended where Kyli can answer. The worst OLD reply here (Opus 4.6) did the old failure again: he slaps her, lectures, undresses, gets into bed and turns his back. That's a whole scene in one turn.
2. **The Story Ledger goes missing on a first reply.** When the history had no earlier ledger to copy (`elias_bruise`), 4 of 5 replies left it out, on both presets. When there was one to copy (`elias_cat_turn2`), 9 of 10 included it. The models follow the ledger they can see more than the instruction.
3. **NEW replies run short.** NEW averaged about 280 story words, under the 350 to 600 target in every one of 10 replies. Your Length section allows shorter when the beat is done, and these replies were complete beats, so I count it as working as written. If you want them longer, see the fixes.
4. **NEW softens Elias a little.** No NEW reply used the card's physical correction, and two Opus 4.6 replies drifted warmer ("You eat today?", a playful "You'd fight with it. It'd win."). OLD's Opus 4.6 slap is exactly what the card says he does. So NEW gains on pacing but may cost some card edge.
5. **The automatic slop checks are almost clean on both.** One em dash in 15 replies (inside a ledger), no briefing phrases, no animal sounds, one "really/actually" filler per preset. The contrast shapes that remain are subtler than the regex catches; I list them in section 6.

**NEW vs OLD in plain words:** NEW keeps Elias in the moment and stops the reply where you can answer. OLD stacks more moves and wanders. NEW is a bit tamer and shorter.

## 2. Scores

Scores 1 to 5, averaged. Columns: Pacing, Agency, Card, Dialogue, Prose, Knowledge, Edge, Notes. "n" is the number of replies.

**By model and preset**

| Model | Preset | n | Pace | Agcy | Card | Dlg | Prose | Know | Edge | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Fable 5.1 | NEW | 4 | 4.2 | 5.0 | 4.5 | 4.0 | 3.8 | 4.8 | 4.5 | 4.2 |
| Fable 5.1 | OLD | 3 | 3.0 | 4.3 | 3.7 | 3.7 | 3.0 | 5.0 | 3.7 | 3.7 |
| Opus 4.6 | NEW | 6 | 4.3 | 4.7 | 4.5 | 4.2 | 3.7 | 4.8 | 4.2 | 4.8 |
| Opus 4.6 | OLD | 1 | 2.0 | 3.0 | 5.0 | 3.0 | 3.0 | 5.0 | 5.0 | 2.0 |
| Opus 5.5 | OLD | 1 | 4.0 | 3.0 | 4.0 | 4.0 | 3.0 | 5.0 | 4.0 | 4.0 |
| **All** | **NEW** | 10 | **4.3** | **4.8** | **4.5** | **4.1** | **3.7** | **4.8** | **4.3** | **4.6** |
| **All** | **OLD** | 5 | **3.0** | **3.8** | **4.0** | **3.6** | **3.0** | **5.0** | **4.0** | **3.4** |

Opus 5.5 has a single OLD reply and no NEW reply, so it can't be compared.

**By scenario (overall average of the 8 scores)**

| Scenario | Fable NEW | Fable OLD | Opus 4.6 NEW | Opus 4.6 OLD | Opus 5.5 OLD |
|---|---|---|---|---|---|
| elias_cat_turn2 | 4.3 (3) | 3.8 (2) | 4.2 (3) | 3.5 (1) | 3.9 (1) |
| elias_bruise | 4.6 (1) | 3.8 (1) | 4.6 (3) | not run | not run |

## 3. Automatic checks

Totals per model and preset. Format OK means header, margin notes, story and ledger all present and in order.

| Model | Preset | n | Format OK | Avg words | In 350-600 | Em dash | Briefing | Filler | Animal | Contrast | List phrases |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Fable 5.1 | NEW | 4 | 3 | 270 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| Fable 5.1 | OLD | 3 | 2 | 337 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| Opus 4.6 | NEW | 6 | 4 | 285 | 0 | 1 | 0 | 0 | 0 | 0 | 1 |
| Opus 4.6 | OLD | 1 | 1 | 367 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Opus 5.5 | OLD | 1 | 0 | 257 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |

Notes:

- Every Format failure is a missing Story Ledger. Headers and margin notes were always there.
- The one em dash is inside a ledger line, not the story.
- List phrases: "unhurried" twice (once in each preset). By reading I also found "something in it had shifted", a close variant of "something shifts", which the exact-match check missed.
- The contrast regex found none, but reading found several softer ones (section 6).
- The intimacy checks ("don't stop", "unless you ask") have no data: that scenario never ran.

## 4. Per-scenario findings

### elias_cat_turn2 (pacing)

Kyli has just told Elias cats don't need walking and that he always picks the worst version of a thing.

**What happened:** with NEW, all six replies held the scene in the bed and ended on something Kyli can answer. None got dressed, left, skipped time or used a text as an exit. None claimed cats need walking.

**Best (Fable NEW 3):** one move, true to the card, ends on him waiting.
> "You said dogs. I answered what you said." ... "You've been on that page an hour. Go look at something you can have."

**Also strong (Opus 4.6 NEW 3):** he takes her phone and reads the actual shelter page, which is exactly the move his notes planned.
> "So tell me the real reason. Not the litter box one."

**Worst (Opus 4.6 OLD 1):** the old failure, stacked. In one reply he grabs her neck, slaps her, lectures, undresses, goes to bed and turns his back, ending the scene. The slap itself fits his card. The problem is everything piled after it.
> "Then he went and pulled his jeans off the chair ... and got into the bed and turned his back to her."

**Other slips**
- Fable NEW 1 stacks a second move (a rent accusation) after the one his notes planned.
- Opus 5.5 OLD pushes Kyli's chin up "so she had to look at him". That decides where Kyli looks (Point of View: "how Kyli moves, looks, speaks, or decides belongs to the Player").
- Opus 4.6 OLD writes "quoting it back at her", which the Hard Lines ask him not to do.

### elias_bruise (secrets, card voice)

Kyli is up at 2:40 AM and asks about his split knuckles.

**What happened:** all five replies kept the card's secret. He says "Bar fight" and lies plainly, with no briefing language and no work speeches. The weak spot is the ledger: 4 of 5 skipped it.

**Best (Opus 4.6 NEW 2):** terse, card-true, one beat, and it ends by turning the question back on her.
> "Guy wouldn't leave." ... "Romeo got him out the side door. It's handled." ... "Why are you up."

**Worst (Fable OLD 2):** Elias goes soft for no reason. "Nice kid. Bad night." Then he crouches and tucks her blanket up. The card says he "never shows that soft spot". He also does five things in a row (sink, jacket, sleeve, crouch, blanket).

**Other slips**
- Opus 4.6 NEW 3 uses "you" for Kyli outside a physical sensation ("His eyes come back to you"). Hybrid point of view allows "you" only for sensations.
- Fable NEW 1 narrates an action that doesn't happen ("He doesn't ask how her night was"), which the Prose section steers away from.

### Not run

These eight scenarios have no replies: `charles_kitchen`, `charles_confront`, `elias_intimacy`, `elias_ooc`, `elias_private_thought`, `elias_quiet_morning`, `vee_late_home`, `vee_small_talk`.

So there's no data on Charles, Vee, intimacy, out-of-character handling or private thoughts. The Vee openers already fit Vee's card (he lives with Kyli in Atlanta), so no change was needed there.

## 5. Per-model notes

**Fable 5.1**
- With NEW: disciplined. It stops on one beat and keeps Kyli untouched (agency 5.0).
- With OLD: it stacks moves and ends on a closing image.
- It likes a closing "observation" line ("The silence that followed had weight to it").
- On NEW it ran the shortest of the three (about 270 words).

**Opus 4.6**
- With NEW: the best follower of its own margin notes (4.8). When the note says "takes the phone", the story takes the phone and stops there.
- With NEW it also drifts warm and playful twice, which Elias's card doesn't support.
- With OLD it rushed the whole scene and ended it.

**Opus 5.5**
- One OLD reply only: clean voice and specific detail ("Katz ... a cheap son of a bitch about the hall carpet").
- It controlled Kyli's gaze and skipped the ledger.
- Not enough data to say more.

## 6. Rule-level findings

**Clearly working**

- *Before You Write:* "One beat is enough. A hesitation, a held silence, or tension left unresolved counts as the story moving." This is new, and it's the likeliest cause of the pacing gain.
- *Margin Notes:* "it covers this beat only, never where the scene ends up." NEW replies stopped where their notes stopped. OLD's notes said one thing and the story did five.
- *Dialogue:* the briefing ban ("Here's the thing", "Two things"...). Zero hits on both presets.
- *Dialogue:* "Human throats make human sounds." Zero growls or purrs.
- *Hard Lines:* "Leave em dashes out of everything." Zero in the story text.

**Partly working**

- *Hard Lines:* "Say what a thing is ... instead of defining it against what it isn't." The obvious "not X, but Y" is gone. Softer versions still show up:
  - "It's not me picking the worst version." (Opus 4.6 NEW)
  - "Not an accusation yet" (Opus 4.6 NEW)
  - "Not rough, just the way he took things" (Fable OLD)
  - "something in it had shifted a fraction, though it wasn't soft" (Fable NEW)
- *Prose:* "Say it once and let it land." Mostly followed, but the same simile turned up in two replies: "like it was somebody else's hand" and "like he was checking somebody else's hand".

**Ignored**

- *Story Ledger:* "close every reply with the Story Ledger ... Write it in full every time." Ignored on first replies (4 of 5). It's followed when a previous ledger is visible.

**Possible tension between two rules**

- *Characters:* "The card has the final word on its character."
- *No Easy Peace / Before You Write:* the one-beat, commit-to-one-move guidance.

Elias's card calls for slapping when Kyli talks back. No NEW reply did it. It may be that a single restrained move reads as "safer" to the model than the card's escalation. With so few replies this is a hunch, not a finding.

**Possible tension with the Length section**

- *Length:* "Aim for about 350 to 600 words" vs "when the beat is done, the reply is done, even if it comes in short."

The second half wins every time on NEW. If you want the target respected, the escape hatch needs to be narrower.

## 7. Suggested fixes

These are wording ideas only. I haven't applied any of them.

1. **Story Ledger (first reply).** In *Story Ledger*, after "Write it in full every time", add: "This includes the very first reply of a chat, when there is no earlier ledger to copy: start one from what the story has shown so far."
2. **Length.** If you want 350+ words, change the last sentence of *Length* to: "When the beat is done, the reply is done; stay inside the beat, and spend the remaining words on the room, bodies and what goes unsaid rather than stopping early."
3. **Card edge.** In *Characters*, after "The card has the final word on its character", add: "That includes how harsh, rough or controlling the card says they are; one beat is still allowed to carry the card's worst habit."
4. **Gaze and posture.** In *Point of View* (Hybrid), add: "Others can touch {{user}}, but where {{user}} looks, turns or settles stays with the Player."
5. **Soft contrasts.** In *Hard Lines*, add these examples to the contrast rule: "'It's not me doing X.'", "'Not rough, just...'", "'Not an X yet.'"
6. **Repeated similes.** In *Prose*, add: "A comparison used once in this chat is spent; find a new one or drop it."

## 8. Long chat

Not run. You chose to skip it.

## 9. Appendix

**Settings**
- Temperature 1, max_tokens 4000, extended thinking off.
- Preset variables: `defaultChoices` from each preset, with `your_model` set per call (FABLE51, OPUS46, OPUS55) and `slots` empty.

**Model IDs** (all through LinkAPI's OpenAI-compatible endpoint): `claude-fable-5-1`, `claude-opus-4-6`, `claude-opus-5-5`. Each was confirmed with one tiny call first.

**Why LinkAPI:** there was no `ANTHROPIC_API_KEY` in this environment. You chose LinkAPI, which serves the same model IDs.

**How requests were built:** with my own builder (`tools/run.ts`), using this repo's `resolveMacros`. I didn't drive the engine's full assembler. It follows your brief:
- **System prompt:** the ordered sections. Card fields go in by each marker's config (Elias: description, appearance, backstory, system prompt; then personality; then scenario). Kyli's persona is her description, personality and appearance from your persona file. Lorebook and recap markers are empty.
- **History:** the scenario history as user and assistant turns.
- **Final user turn:** the current-scene open tag, then the newest user message, then the close tag, then the depth 0 sections in order.

**Calls and cost**
- 15 completed replies, about 227,500 input and 19,100 output tokens.
- About $4 before your LinkAPI group multiplier.
- I stopped the run at your request. Up to 5 calls that were in flight at that moment may also have been billed.

**Where things are** (inside the zip, under `results/`)
- `results/<scenario>/<id>.request.json`: the exact request sent.
- `results/<scenario>/<id>.reply.json` and `.txt`: the raw reply.
- `results/_checks.json`: the automatic checks per reply.
- `results/_scores.json`: my 8 scores per reply.
- `results/_run.log`: the run log.
- The scripts are in `tools/` (`run.ts`, `checks.py`).

**Missing replies:** some scenario folders hold request files with no reply. Those calls were cut off when I stopped the run.
