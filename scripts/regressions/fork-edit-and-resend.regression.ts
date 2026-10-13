/**
 * Fork: Edit & resend only targets the newest user turn, with at most one reply after it.
 */
import assert from "node:assert/strict";

const { getResendableUserMessageId } = await import("../../packages/client/src/lib/fork/edit-and-resend.js");

const user = (id: string) => ({ id, role: "user" });
const ai = (id: string) => ({ id, role: "assistant" });

assert.equal(getResendableUserMessageId([]), null);
assert.equal(getResendableUserMessageId(undefined), null);
// Waiting for a reply: the last message is the user's.
assert.equal(getResendableUserMessageId([ai("a1"), user("u1")]), "u1");
// The usual case: the user's turn and the reply to it.
assert.equal(getResendableUserMessageId([user("u1"), ai("a1"), user("u2"), ai("a2")]), "u2");
// Two replies in a row (group chat): resending would strand the second one.
assert.equal(getResendableUserMessageId([user("u1"), ai("a1"), ai("a2")]), null);
// A chat that starts with the character's greeting only.
assert.equal(getResendableUserMessageId([ai("greeting")]), null);
// Other roles at the tail are never treated as a reply.
assert.equal(getResendableUserMessageId([user("u1"), { id: "s1", role: "system" }]), null);

console.log("fork edit-and-resend: ok");
