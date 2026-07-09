import { describe, expect, it } from "bun:test";
import { deterministicSessionId } from "./mirror-terminal-session";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("deterministicSessionId", () => {
	it("returns a valid RFC-4122 v5 UUID (version + variant nibbles set)", () => {
		const id = deterministicSessionId("terminal-abc");
		expect(id).toMatch(UUID_RE);
		// version nibble → 5, variant nibble → 8|9|a|b
		expect(id.charAt(14)).toBe("5");
		expect(["8", "9", "a", "b"]).toContain(id.charAt(19));
	});

	it("is stable for the same terminalId (idempotency anchor)", () => {
		expect(deterministicSessionId("terminal-abc")).toBe(
			deterministicSessionId("terminal-abc"),
		);
	});

	it("differs for different terminalIds", () => {
		expect(deterministicSessionId("terminal-abc")).not.toBe(
			deterministicSessionId("terminal-def"),
		);
	});

	it("accepts non-UUID terminalIds and still yields a valid uuid", () => {
		// The hook input does not constrain terminalId to a UUID; the derivation
		// must never produce something `chat.createSession`'s `z.uuid()` rejects.
		expect(deterministicSessionId("not-a-uuid at all!")).toMatch(UUID_RE);
	});
});
