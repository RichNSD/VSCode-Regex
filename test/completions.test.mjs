import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const { complete, toSnippet } = createRequire(import.meta.url)("../src/completions.js");

/** Completions at the `|` in `text`. */
function at(flavor, text) {
	const offset = text.indexOf("|");
	const result = complete(flavor, text.slice(0, offset) + text.slice(offset + 1), offset);
	return result && { ...result, labels: result.items.map((i) => i.label) };
}

/** Accepts `label` at the `|` and returns the resulting text, with `$0` etc. left in place. */
function accept(flavor, text, label) {
	const offset = text.indexOf("|");
	const doc = text.slice(0, offset) + text.slice(offset + 1);
	const result = complete(flavor, doc, offset);
	const entry = result.items.find((i) => i.label === label);
	const insert = entry.snippet ? toSnippet(entry.snippet) : entry.label;
	return doc.slice(0, result.from) + insert + doc.slice(result.to);
}

test("offers escapes after a backslash, by flavour", () => {
	const pcre = at("pcre", "a\\|");
	assert.equal(pcre.from, 1);
	assert.ok(pcre.labels.includes("\\d"));
	assert.ok(pcre.labels.includes("\\K"));
	const js = at("javascript", "a\\|");
	assert.ok(js.labels.includes("\\u{hhhhh}"));
	assert.ok(!js.labels.includes("\\K"));
	const py = at("python", "\\|");
	assert.ok(py.labels.includes("\\A"));
	assert.ok(!py.labels.includes("\\k<name>"));
});

test("does not complete after an escaped backslash or on plain text", () => {
	assert.equal(at("pcre", "\\\\|"), null);
	assert.equal(at("pcre", "abc|"), null);
	assert.equal(at("pcre", "(|"), null);
	assert.equal(at("pcre", "\\(?|"), null);
	assert.equal(at("pcre", "a?|"), null);
});

test("only looks at the current line", () => {
	assert.equal(at("pcre", "a\\\n|"), null);
	assert.equal(at("pcre", "(?<x>a)\n\\|").from, 8);
});

test("offers group constructs after (?", () => {
	const result = at("pcre", "x(?|");
	assert.equal(result.from, 1);
	assert.ok(result.labels.includes("(?:…)"));
	assert.ok(result.labels.includes("(*PRUNE)"));
	assert.ok(!at("javascript", "(?|").labels.includes("(?>…)"));
	assert.ok(at("python", "(?|").labels.includes("(?P<name>…)"));
});

test("snippets insert correctly, without doubling an auto-closed bracket", () => {
	assert.equal(accept("pcre", "a(?|", "(?:…)"), "a(?:$0)");
	assert.equal(accept("pcre", "a(?|)", "(?:…)"), "a(?:$0)");
	assert.equal(accept("pcre", "(?|)", "(?<name>…)"), "(?<${1:name}>$0)");
	assert.equal(accept("pcre", "(*|)", "(*PRUNE)"), "(*PRUNE)");
	assert.equal(accept("pcre", "\\|", "\\d"), "\\d");
	assert.equal(accept("pcre", "\\|", "\\p{…}"), "\\\\p{${1:L}\\}");
	assert.equal(accept("pcre", "(?|", "(?(1)…|…)"), "(?(${1:1})${2:yes}|${3:no})");
	assert.equal(accept("pcre", "[[:al|]]", "[:alpha:]"), "[[:alpha:]]");
});

test("suggests named groups from the document", () => {
	const text = "(?<year>\\d+)(?'month'\\d+)(?P<day>\\d+)\\k|";
	const labels = at("pcre", text).labels;
	assert.ok(labels.includes("\\k<year>"));
	assert.ok(labels.includes("\\k<month>"));
	assert.ok(labels.includes("\\k<day>"));
	assert.ok(at("pcre", `${text.slice(0, -3)}(?|`).labels.includes("(?&year)"));
	assert.ok(at("python", "(?P<w>a)(?|").labels.includes("(?P=w)"));
});

test("POSIX classes inside sets (PCRE only)", () => {
	const result = at("pcre", "[[:al|]]");
	assert.equal(result.from, 1);
	assert.equal(result.to, 6, "swallows the auto-closed ]");
	assert.ok(result.labels.includes("[:alpha:]"));
	assert.equal(at("pcre", "[[:al|]").to, 5);
	assert.equal(at("javascript", "[[:|"), null);
});
