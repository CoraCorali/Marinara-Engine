/**
 * Fork: a chat's weather choices are saved with the chat. Choices made while a save is on its way
 * are kept until they are saved too; older browser-only choices can be dropped once moved over.
 */
import assert from "node:assert/strict";

const { useForkWeatherStore } = await import("../../packages/client/src/stores/fork-weather.store.js");
const store = () => useForkWeatherStore.getState();

store().setPending("c1", { amount: 1.5, light: false });
const saving = { amount: 1.5, light: false };
store().setPending("c1", { amount: 2 }); // moved again while the save was on its way
store().settlePending("c1", saving);
assert.deepEqual(store().pending.c1, { amount: 2 }, "a newer choice waits for its own save");
store().settlePending("c1", { amount: 2 });
assert.equal(store().pending.c1, undefined, "nothing left once everything is saved");

useForkWeatherStore.setState({ byChat: { c1: { amount: 0.5 }, c2: { speed: 2 } } });
store().dropLegacy("c1");
assert.deepEqual(Object.keys(store().byChat), ["c2"], "only the moved chat's old choices go");
store().setPending("c2", { tint: "#fff" });
store().clearPending("c2");
assert.equal(store().pending.c2, undefined);
console.log("fork weather prefs sync: ok");
