/**
 * Fork: a gateway that reports a failure mid-stream (an error alongside choices, or a choice that
 * finishes with "error") fails the reply instead of saving the cut-off text as a success.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { OpenAIProvider } from "../../packages/server/src/services/llm/providers/openai.provider.js";

let mode: "error-with-choices" | "finish-error" | "clean" = "clean";
const server = createServer(async (request, response) => {
  for await (const _chunk of request) {
    // drain
  }
  response.writeHead(200, { "content-type": "text/event-stream", connection: "close" });
  response.write(
    `data: ${JSON.stringify({ choices: [{ delta: { content: "Half a repl" }, finish_reason: null }] })}\n\n`,
  );
  if (mode === "error-with-choices") {
    response.write(
      `data: ${JSON.stringify({ error: { message: "upstream overloaded" }, choices: [{ delta: { content: "" }, finish_reason: "error" }] })}\n\n`,
    );
  } else if (mode === "finish-error") {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "error" }] })}\n\n`);
  } else {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "y." }, finish_reason: "stop" }] })}\n\n`);
  }
  response.end("data: [DONE]\n\n");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const provider = new OpenAIProvider(
    `http://127.0.0.1:${address.port}/v1`,
    "fixture",
    undefined,
    undefined,
    undefined,
    "custom",
  );
  const run = async () => {
    let text = "";
    for await (const chunk of provider.chat([{ role: "user", content: "Go." }], { model: "m", stream: true })) {
      text += chunk;
    }
    return text;
  };

  mode = "clean";
  assert.equal(await run(), "Half a reply.");
  mode = "error-with-choices";
  await assert.rejects(run, /upstream overloaded/, "an error chunk that still has choices fails the reply");
  mode = "finish-error";
  await assert.rejects(run, /stream ended with an error/, 'finish_reason "error" fails the reply');
  mode = "error-with-choices";
  await assert.rejects(
    provider.chatComplete([{ role: "user", content: "Go." }], { model: "m", stream: true, onToken: () => {} }),
    /upstream overloaded/,
  );
} finally {
  server.close();
}
console.log("fork stream error: ok");
