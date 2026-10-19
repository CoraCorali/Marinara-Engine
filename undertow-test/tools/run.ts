// Builds each request the way the test brief describes (rendered with this repo's macro engine) and
// sends it to LinkAPI's OpenAI-compatible endpoint. Saves every request and reply under results/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolveMacros } from "../../packages/shared/src/utils/macro-engine.ts";

const MODELS: Record<string, string> = { "claude-fable-5-1": "FABLE51", "claude-opus-4-6": "OPUS46", "claude-opus-5-5": "OPUS55" };
const PRESETS = { NEW: "Undertow 2.0 (Jules) NEW.marinara.json", OLD: "Undertow 2.0 (Jules) OLD before Oct 19.marinara.json" };
const CARDS: Record<string, string> = { "Elias Mercer": "cards/Elias.marinara.json", 'Charles "Big Daddy" Corrine': "cards/Charles (organized).marinara.json", Vee: "cards/Vee.marinara.json" };
const RUNS = { NEW: 3, OLD: 2 };

const persona = JSON.parse(readFileSync("cards/Kyli.persona.marinara.json", "utf8")).data;
const scenarios = JSON.parse(readFileSync("scenarios.json", "utf8"));

function card(name: string) {
  const d = JSON.parse(readFileSync(CARDS[name] ?? CARDS[Object.keys(CARDS).find((k) => name.startsWith(k.split(" ")[0]!))!]!, "utf8")).data.data;
  return { ...d, appearance: d.extensions?.appearance ?? "", backstory: d.extensions?.backstory ?? "" };
}

function build(presetKey: keyof typeof PRESETS, model: string, sc: any) {
  const d = JSON.parse(readFileSync(PRESETS[presetKey], "utf8")).data;
  const choices = JSON.parse(d.preset.defaultChoices);
  choices.your_model = MODELS[model];
  delete choices.slots;
  const variables: Record<string, string> = { slots: "" };
  for (const [k, v] of Object.entries(choices)) variables[k] = Array.isArray(v) ? (v as string[]).join(", ") : String(v);
  const c = card(sc.card);
  const ctx: any = { user: "Kyli", char: c.name, characters: [c.name], variables };
  const r = (t: string) => resolveMacros(t ?? "", ctx).trim();
  const order: string[] = JSON.parse(d.preset.sectionOrder);
  const byId = Object.fromEntries(d.sections.map((s: any) => [s.id, s]));
  const system: string[] = [];
  const depth0: string[] = [];
  let open = "";
  let close = "";
  for (const id of order) {
    const s = byId[id];
    if (!s || s.enabled !== "true") continue;
    if (s.isMarker === "true") {
      const cfg = JSON.parse(s.markerConfig || "{}");
      let text = "";
      if (cfg.type === "character") text = (cfg.characterFields as string[]).map((f) => r(c[f] ?? "")).filter(Boolean).join("\n\n");
      else if (cfg.type === "persona") text = [persona.description, persona.personality, persona.appearance].map(r).filter(Boolean).join("\n\n");
      else if (cfg.type === "dialogue_examples") text = r(c.mes_example ?? "");
      if (text) system.push(text);
      continue;
    }
    const out = r(s.content);
    if (!out) continue;
    if (s.injectionPosition === "depth") {
      if (s.name.includes("Current Scene (open")) open = out;
      else if (s.name.includes("Current Scene (close")) close = out;
      else depth0.push(out);
    } else system.push(out);
  }
  const history = sc.history.map((m: any) => ({ role: m.role, content: r(m.content) }));
  const last = history[history.length - 1];
  last.content = [open, last.content, close, ...depth0].filter(Boolean).join("\n\n");
  return { model, temperature: 1, max_tokens: 4000, messages: [{ role: "system", content: system.join("\n\n") }, ...history] };
}

async function call(body: any) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.linkapi.ai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      });
      const json: any = await res.json();
      if (json.choices?.[0]?.message?.content) return json;
      console.error("bad answer", attempt, JSON.stringify(json).slice(0, 300));
    } catch (error) {
      console.error("error", attempt, String(error).slice(0, 200));
    }
    await new Promise((done) => setTimeout(done, 5000 * attempt));
  }
  return null;
}

const jobs: { id: string; run: () => Promise<void> }[] = [];
for (const sc of scenarios) {
  const models = sc.models.includes("all") ? Object.keys(MODELS) : sc.models;
  for (const model of models)
    for (const preset of ["NEW", "OLD"] as const)
      for (let n = 1; n <= RUNS[preset]; n++) {
        const id = `${sc.id}__${MODELS[model]}__${preset}__${n}`;
        jobs.push({
          id,
          run: async () => {
            const dir = `results/${sc.id}`;
            mkdirSync(dir, { recursive: true });
            if (existsSync(`${dir}/${id}.reply.json`)) return;
            const body = build(preset, model, sc);
            writeFileSync(`${dir}/${id}.request.json`, JSON.stringify(body, null, 2));
            const reply = await call(body);
            if (!reply) return console.error("FAILED", id);
            writeFileSync(`${dir}/${id}.reply.json`, JSON.stringify(reply, null, 2));
            writeFileSync(`${dir}/${id}.txt`, reply.choices[0].message.content);
            console.log("done", id, reply.usage?.prompt_tokens, reply.usage?.completion_tokens);
          },
        });
      }
}
if (process.argv[2] === "--dry") {
  const body = build("NEW", "claude-fable-5-1", scenarios[0]);
  writeFileSync("results/_dry.request.json", JSON.stringify(body, null, 2));
  console.log(jobs.length, "jobs; dry request chars:", JSON.stringify(body).length);
} else {
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 5 }, async () => { while (queue.length) await queue.shift()!.run(); }));
  console.log("all finished");
}
