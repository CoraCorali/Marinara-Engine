# Undertow live test: prompt for Claude Code

Start a Claude Code session on your Marinara fork (CoraCorali/Marinara-Engine), branch `undertow-test-kit`, then paste everything below the line.

---

I want you to run a live test of my roleplay preset, Undertow 2.0, against the real Claude models through the Anthropic API, and write me one full findings report. You have my API key in this environment (ANTHROPIC_API_KEY). Don't edit the preset; this is testing only.

## Where everything is

Everything is in the `undertow-test/` folder on this branch, and this repo is my Marinara Engine fork, so the engine code is right here.


- `Undertow 2.0 (Jules) NEW.marinara.json`: the preset to test (Marinara Engine export).
- `Undertow 2.0 (Jules) OLD before Oct 19.marinara.json`: the version from before the latest changes, used as the baseline.
- `scenarios.json`: 10 test scenarios, each with the card to use, what it tests, the chat history up to the reply being tested, and what to watch for.
- `tools/render.ts`: a small helper that renders the preset with this repo's macro engine (run it from `undertow-test/` with `npx tsx tools/render.ts <preset> <MODEL> <out.txt>`). Use it, or build your own from it.
- My character cards (Marinara exports) are attached to this chat: Elias, Charles (organized) and Vee. Save them into `undertow-test/cards/` as `Elias.marinara.json`, `Charles (organized).marinara.json` and `Vee.marinara.json`, and don't commit them. Scenarios name the card they need. If a card is missing, stop and ask me for it.
- The two Vee scenarios use a generic opener. If a detail in one contradicts Vee's card (where they live, who they are to Kyli), change only that detail to fit the card and note the change in the report.
- My persona is Kyli (she/her). If you can't find a persona file, ask me for her description before you start.

## Before you start, ask me

1. The exact model IDs I want tested. Expected: Claude Fable 5.1, Claude Opus 4.6 and Claude Opus 5.5. Confirm each ID works with one tiny API call, and list the models endpoint if one fails.
2. My generation settings in Marinara: temperature, max tokens, and whether extended thinking is on for each model. If I don't answer, use temperature 1, max_tokens 4000, thinking off.
3. Whether to run the optional long-chat test at the end (it costs the most).

Then give me a cost estimate (calls × prompt size) and wait for my go-ahead.

## How to build each request

Build the prompt the way Marinara Engine does. Use `resolveMacros` from this repo's `packages/shared/src/utils/macro-engine.ts` to render each preset section (run it with `npx tsx`; `tools/render.ts` shows how). If you can drive the engine's own assembler in `packages/server/src/services/prompt/assembler.ts` headlessly, prefer that and say so in the report. Otherwise:

- Variables: take `data.preset.defaultChoices`, join multi-select arrays with ", ", and set `your_model` to `FABLE51`, `OPUS46` or `OPUS55` to match the model being called. Leave `slots` empty. The slot sections in these copies are blank on purpose.
- Macro context: `user` = "Kyli", `char` = the card's name, `characters` = [that name].
- Walk `data.preset.sectionOrder`. Skip sections whose `enabled` isn't "true" and sections that render empty.
- Sections with `injectionPosition` "ordered" go into the system prompt in order. Marker sections are placeholders: fill "Char Description" with the card's description, then personality, scenario, backstory and appearance (from `data.data` and `data.data.extensions`), "Persona Description" with Kyli's description, "Chat Examples" with the card's `mes_example`. Leave the lorebook and recap markers empty.
- "Chat History" is the scenario's `history`, as alternating user/assistant messages.
- Sections with `injectionPosition` "depth" and depth 0 go after the newest user message, in section order, joined into that final user turn. The depth 1 "Current Scene (open)" tag goes right before the newest user message and the depth 0 "close" tag right after it.
- Save every full request you send as JSON, so I can see exactly what each model got.

## What to run

For each scenario, call every model it lists ("all" means all three) **3 times with the NEW preset and 2 times with the OLD preset**. Same settings for both. Save every raw reply.

Optional long-chat test (only if I say yes): Elias Mercer, NEW preset, Fable 5.1 only. Start from the `elias_quiet_morning` history and run 10 exchanges. Write Kyli's turns with a separate call to Opus 4.6, told to write only Kyli, 1 to 3 sentences, in the style of the opener, reacting to what just happened. Before each request, do what my regex pack does: keep `<margin_notes>` and `<story_ledger>` only on the newest assistant message and strip them from older ones; keep `<authors_note>` only in the last 3 messages.

## How to judge each reply

Run automatic checks first, then read every reply yourself.

**Automatic checks (count per reply):**
- Format: scene header, margin notes, story, story ledger all present and in that order.
- Story word count (text between `</margin_notes>` and `<story_ledger`, tags removed). Target is 350 to 600, and shorter is allowed when the beat is done.
- Em dashes (—) anywhere.
- Briefing phrases: "here's the thing/deal", "two things", "bottom line", "long story short", "real talk", "honest answer", "and honestly?".
- Restatement and filler: "really", "genuinely", "truly", "actually" used as bare emphasis.
- Animal sounds from humans: growl, purr, snarl, rumble, whine.
- Contrast shapes: "not X, but Y", "it wasn't X. It was Y.", "not just", "less X than Y".
- Phrases from the preset's phrase list (in the Hard Lines section: husky, predatory, ozone, "after a beat", "the air is thick", load-bearing, and the rest).
- Intimacy scenario: "don't stop" count, "unless you ask/want" shapes.

**Read every reply and score 1 to 5, with a one-line reason:**
1. Pacing: one beat, no stacked moves, ends where Kyli can answer, no exit or time skip.
2. Player agency: nothing Kyli says, does, thinks or feels is written (second-person physical sensations on her are allowed).
3. Card fidelity: the character sounds and acts like their card.
4. Dialogue: sounds like a person; no briefing, grading, recapping, or stubs chopped for rhythm.
5. Prose: concrete and plain, nothing repeated from the history, no taglines at the end.
6. Knowledge: nobody knows what they shouldn't.
7. Edge: flaws and pressure stay active, with no softening or apologizing out of nowhere.
8. Notes follow-through: the story does what the margin notes planned, and the Next moves line is a single move.

Flag every slip with a short quote and the preset rule it breaks (name the section).

## The report

Write one Markdown file, `undertow-test/Undertow test report.md`:

1. **Summary**: overall verdict, the 3 to 5 most important findings, and NEW vs OLD in plain words.
2. **Scores table**: model × scenario, NEW and OLD averages for each of the 8 scores.
3. **Automatic checks table**: totals per model and preset.
4. **Per-scenario findings**: what happened, with short quotes of the best and worst replies.
5. **Per-model notes**: habits each model shows (for example, Fable rushing, Opus 5.5 going soft).
6. **Rule-level findings**: which preset rules are clearly working, which get ignored, and any two rules that seem to pull against each other. Quote the rule text.
7. **Suggested fixes**: specific wording changes, with the section name for each. Don't apply them.
8. **Long chat** (if run): drift, repeated gestures, ledger health, pacing over time.
9. **Appendix**: settings, model IDs, call count and token cost, and where the raw requests and replies are saved.

Keep the report readable on a phone: short paragraphs, small tables, no em dashes. Put all raw outputs in `undertow-test/results/`, then zip the report with that folder into `undertow-test/Undertow test results.zip` so I can send it back in one file. Then commit the report and the zip (not the `cards/` folder) to this branch and push, so I can download the zip from GitHub.
