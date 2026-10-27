import assert from "node:assert/strict";
import { test } from "node:test";
import { scopesAt, tokenize } from "./tokenize.mjs";

/** Asserts the token at `needle` carries `scope` (and optionally lacks `not`). */
async function has(language, text, needle, scope, from) {
	const scopes = await scopesAt(language, text, needle, from);
	assert.ok(scopes.includes(scope), `"${needle}" in ${JSON.stringify(text)}: expected ${scope}, got ${scopes.join(" ")}`);
}
async function plain(language, text, needle, from) {
	const scopes = (await scopesAt(language, text, needle, from)).filter((s) => !s.startsWith("meta."));
	assert.deepEqual(scopes, [], `"${needle}" should be plain, got ${scopes.join(" ")}`);
}

test("PCRE: groups, classes, quantifiers, anchors", async () => {
	const re = String.raw`^(?<year>\d{4})-(?:0[1-9]|1[0-2])\.[[:alpha:]a-z\]]+?\k<year>$`;
	await has("regexp", re, "^", "keyword.control.anchors.regexp");
	await has("regexp", re, "(", "keyword.control.group.regexp");
	await has("regexp", re, "year", "entity.name.capture-group.regexp");
	await has("regexp", re, "\\d", "keyword.control.character-class.regexp");
	await has("regexp", re, "{4}", "keyword.operator.quantifier.regexp");
	await has("regexp", re, "?:", "constant.other.assertion.regexp");
	await has("regexp", re, "1-9", "constant.other.range.regexp");
	await has("regexp", re, "|", "keyword.operator.alternation.regexp");
	await has("regexp", re, "\\.", "constant.character.escape.regexp");
	await has("regexp", re, ":alpha:", "constant.other.posix-class.regexp");
	await has("regexp", re, "\\]", "constant.character.escape.regexp");
	await has("regexp", re, "+?", "keyword.operator.quantifier.regexp");
	await has("regexp", re, "year", "variable.other.backref-and-recursion.regexp", re.indexOf("\\k"));
	await plain("regexp", re, "-");
});

test("PCRE: invalid constructs", async () => {
	await has("regexp", "*abc", "*", "invalid.illegal.unexpected-quantifier.regexp");
	await has("regexp", "a)", ")", "invalid.illegal.unmatched-brace.regexp");
	await has("regexp", "a|+", "+", "invalid.illegal.unexpected-quantifier.regexp");
	await has("regexp", "(?:*a)", "*", "invalid.illegal.unexpected-quantifier.regexp");
	await has("regexp", String.raw`\x`, "\\x", "invalid.illegal.character.escape.regexp");
	await has("regexp", "a+b*", "*", "keyword.operator.quantifier.regexp");
});

test("PCRE: comments, modes, verbs, quoting", async () => {
	const re = String.raw`(?i)a(?#note)(*PRUNE)\Qx\E\x{1F600}`;
	await has("regexp", re, "?i", "storage.modifier.mode.regexp");
	await has("regexp", re, "note", "comment.block.group.regexp");
	await has("regexp", re, "(*PRUNE)", "keyword.control.verb.regexp");
	await has("regexp", re, "\\Q", "keyword.control.regexp");
	await has("regexp", re, "\\x{1F600}", "constant.character.escape.regexp");
});

test("PCRE: extended mode comments end at the newline", async () => {
	const re = "(?x) a+ # one or more a\n  b # then b\nc";
	await has("regexp", re, "# one", "comment.line.number-sign.regexp");
	await plain("regexp", re, "b");
	await has("regexp", re, "# then", "comment.line.number-sign.regexp");
	await plain("regexp", re, "c");
	await plain("regexp", "a # b", "#");
});

test("PCRE: state carries across lines", async () => {
	const re = "(?<name>\n\n  [a-\nz]\n)+";
	await has("regexp", re, "+", "keyword.operator.quantifier.regexp");
	await has("regexp", re, ")", "keyword.control.group.regexp");
	await has("regexp", "(?#\nstill comment\n)x", "still", "comment.block.group.regexp");
});

test("JavaScript flavour", async () => {
	const re = String.raw`^(?:[a-z\d\-]+)(?=x)\1|\x41{2,}$`;
	await has("regexp-javascript", re, "^", "keyword.control.anchor.regexp");
	await has("regexp-javascript", re, "(", "punctuation.definition.group.regexp");
	await has("regexp-javascript", re, "?:", "punctuation.definition.group.no-capture.regexp");
	await has("regexp-javascript", re, "[", "punctuation.definition.character-class.regexp");
	await has("regexp-javascript", re, "\\-", "constant.character.escape.backslash.regexp");
	await has("regexp-javascript", re, "\\1", "keyword.other.back-reference.regexp");
	await has("regexp-javascript", re, "{2,}", "keyword.operator.quantifier.regexp");
});

test("Python flavour", async () => {
	const re = String.raw`(?P<word>\w+)\s(?P=word)(?<=a)(?i)  # repeated`;
	await has("regexp-python", re, "word", "entity.name.section.group.regexp");
	await has("regexp-python", re, "\\w", "constant.character.character-class.regexp");
	await has("regexp-python", re, "(?P=word)", "keyword.other.back-reference.named.regexp");
	await has("regexp-python", re, "?<=", "meta.assertion.look-behind.regexp");
	await has("regexp-python", re, "(?i)", "keyword.other.option-toggle.regexp");
	await has("regexp-python", re, "# repeated", "comment.line.number-sign.regexp");
});

test("arbitrary input never throws", async () => {
	const alphabet = "()[]{}?*+|^$\\.-:<>=!#'PRk0123abcdhxsw \n";
	let seed = 42;
	const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
	for (const language of ["regexp", "regexp-javascript", "regexp-python"]) {
		for (let i = 0; i < 300; i++) {
			let text = "";
			for (let j = Math.floor(random() * 80); j > 0; j--) text += alphabet[Math.floor(random() * alphabet.length)];
			await tokenize(language, text);
		}
	}
});
