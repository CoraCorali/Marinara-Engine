// Fork feature: a model of its own for each of the fork's side jobs (see FORK.md).
//
// The Director, chapter recaps, the phone, the season lookup and "describe this picture" each used
// whatever model their resolver landed on. A writer who keeps the story on a slow thinking model and
// the agents on a fast one picks here, per job, the way agents pick a connection.
import type { DB } from "../../db/connection.js";
import { createAppSettingsStorage } from "../storage/app-settings.storage.js";
import { resolveForkChatProvider, type ForkChatProvider } from "./fork-chat-provider.js";

export const FORK_JOBS = ["director", "chapters", "phone", "season", "describe"] as const;
export type ForkJob = (typeof FORK_JOBS)[number];
export type ForkJobModels = Record<ForkJob, string>;

const FORK_JOB_MODELS_KEY = "forkJobModels";
const MAX_CONNECTION_ID_CHARS = 200;

/**
 * A side job needs little thought. Without this a thinking model spends a small output limit on
 * thinking and the answer comes back cut off or empty.
 */
export const FORK_LOW_THINKING = { reasoningEffort: "low" } as const;

/** The saved choices, with every job present; "" means the job keeps its usual model. */
export function readForkJobModelsValue(raw: unknown): ForkJobModels {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const record =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const models = {} as ForkJobModels;
  for (const job of FORK_JOBS) {
    const value = record[job];
    models[job] = typeof value === "string" ? value.trim().slice(0, MAX_CONNECTION_ID_CHARS) : "";
  }
  return models;
}

export async function readForkJobModels(db: DB): Promise<ForkJobModels> {
  return readForkJobModelsValue(await createAppSettingsStorage(db).get(FORK_JOB_MODELS_KEY));
}

export async function writeForkJobModels(db: DB, value: unknown): Promise<ForkJobModels> {
  const models = readForkJobModelsValue(value);
  await createAppSettingsStorage(db).set(FORK_JOB_MODELS_KEY, JSON.stringify(models));
  return models;
}

/**
 * The connection picked for a job, ready to call, or null when none is picked or it no longer
 * resolves (a deleted connection): the caller then uses the model it always used.
 */
export async function resolvePickedForkJobProvider(
  db: DB,
  chat: Parameters<typeof resolveForkChatProvider>[1],
  job: ForkJob,
): Promise<Extract<ForkChatProvider, { ok: true }> | null> {
  const picked = (await readForkJobModels(db))[job];
  if (!picked) return null;
  const resolved = await resolveForkChatProvider(db, chat, picked);
  return resolved.ok ? resolved : null;
}
