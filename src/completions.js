/**
 * Regex completions, independent of the editor API so they can be tested
 * directly. They only trigger after regex-specific prefixes (`\`, `(?`,
 * `(*`, `[:`), so ordinary literal text never pops up a list. Named groups
 * defined in the document are offered as back-references.
 *
 * Snippet templates use `${}` / `${name}` / `${1:default}` fields and are
 * converted to VS Code snippet syntax by `toSnippet`.
 */

const PCRE = "pcre";
const JS = "javascript";
const PY = "python";
const ALL = [PCRE, JS, PY];

// [label, detail, flavors, snippet?]
const ESCAPES = [
	["\\d", "digit", ALL],
	["\\D", "non-digit", ALL],
	["\\w", "word character", ALL],
	["\\W", "non-word character", ALL],
	["\\s", "whitespace", ALL],
	["\\S", "non-whitespace", ALL],
	["\\h", "horizontal whitespace", [PCRE]],
	["\\H", "non-horizontal whitespace", [PCRE]],
	["\\v", "vertical whitespace", [PCRE]],
	["\\V", "non-vertical whitespace", [PCRE]],
	["\\R", "any line break", [PCRE]],
	["\\X", "extended grapheme cluster", [PCRE]],
	["\\N", "non-newline", [PCRE]],
	["\\b", "word boundary", ALL],
	["\\B", "non-word boundary", ALL],
	["\\A", "start of subject", [PCRE, PY]],
	["\\z", "end of subject", [PCRE]],
	["\\Z", "end of subject or before final newline", [PCRE, PY]],
	["\\G", "first match position", [PCRE]],
	["\\K", "reset match start", [PCRE]],
	["\\Q", "quote until \\E", [PCRE], "\\Q${}\\E"],
	["\\t", "tab", ALL],
	["\\n", "newline", ALL],
	["\\r", "carriage return", ALL],
	["\\f", "form feed", ALL],
	["\\v", "vertical tab", [JS, PY]],
	["\\e", "escape", [PCRE]],
	["\\a", "bell", [PCRE, PY]],
	["\\0", "null character", [JS]],
	["\\xhh", "hex character", ALL, "\\x${hh}"],
	["\\x{hhhh}", "hex code point", [PCRE], "\\x{${hhhh}}"],
	["\\uhhhh", "unicode character", [JS, PY], "\\u${hhhh}"],
	["\\u{hhhhh}", "unicode code point (u flag)", [JS], "\\u{${hhhhh}}"],
	["\\cX", "control character", [PCRE, JS], "\\c${X}"],
	["\\p{…}", "unicode property", [PCRE, JS], "\\p{${L}}"],
	["\\P{…}", "not unicode property", [PCRE, JS], "\\P{${L}}"],
	["\\k<name>", "named back-reference", [PCRE, JS], "\\k<${name}>"],
	["\\g{n}", "back-reference / relative", [PCRE], "\\g{${1:1}}"],
	["\\g<name>", "subroutine call", [PCRE], "\\g<${name}>"],
];

// [label, detail, flavors, snippet]
const GROUPS = [
	["(?:…)", "non-capturing group", ALL, "(?:${})"],
	["(?<name>…)", "named capture group", [PCRE, JS], "(?<${name}>${})"],
	["(?'name'…)", "named capture group", [PCRE], "(?'${name}'${})"],
	["(?P<name>…)", "named capture group", [PCRE, PY], "(?P<${name}>${})"],
	["(?=…)", "positive lookahead", ALL, "(?=${})"],
	["(?!…)", "negative lookahead", ALL, "(?!${})"],
	["(?<=…)", "positive lookbehind", ALL, "(?<=${})"],
	["(?<!…)", "negative lookbehind", ALL, "(?<!${})"],
	["(?>…)", "atomic group", [PCRE], "(?>${})"],
	["(?#…)", "comment", [PCRE, PY], "(?#${})"],
	["(?i)", "case-insensitive", [PCRE, PY], "(?i)"],
	["(?m)", "multiline", [PCRE, PY], "(?m)"],
	["(?s)", "dot matches newline", [PCRE, PY], "(?s)"],
	["(?x)", "extended (ignore whitespace)", [PCRE, PY], "(?x)"],
	["(?i:…)", "case-insensitive group", [PCRE, PY], "(?i:${})"],
	["(?(1)…|…)", "conditional", [PCRE, PY], "(?(${1:1})${yes}|${no})"],
	["(?(<name>)…|…)", "named conditional", [PCRE], "(?(<${name}>)${yes}|${no})"],
	["(?(DEFINE)…)", "subpattern definitions", [PCRE], "(?(DEFINE)${})"],
	["(?R)", "recurse whole pattern", [PCRE], "(?R)"],
	["(?1)", "recurse group", [PCRE], "(?${1:1})"],
	["(?&name)", "recurse named group", [PCRE], "(?&${name})"],
	["(?P=name)", "named back-reference", [PY], "(?P=${name})"],
];

const VERBS = ["PRUNE", "SKIP", "THEN", "COMMIT", "FAIL", "F", "ACCEPT"];

const POSIX = [
	"alnum", "alpha", "ascii", "blank", "cntrl", "digit", "graph",
	"lower", "print", "punct", "space", "upper", "word", "xdigit",
];

const NAMED_GROUP = /\(\?(?:P?<([A-Za-z_]\w*)>|'([A-Za-z_]\w*)')/g;

function namedGroups(text) {
	const names = new Set();
	for (const m of text.matchAll(NAMED_GROUP)) names.add(m[1] || m[2]);
	return [...names];
}

function item(label, detail, snippet, kind = "keyword", boost = 0) {
	return { label, detail, kind, boost, snippet: snippet && snippet !== label ? snippet : null };
}

/** True when the character at `index` of `line` follows an odd number of backslashes. */
function isEscaped(line, index) {
	let count = 0;
	for (let i = index - 1; i >= 0 && line[i] === "\\"; i--) count++;
	return count % 2 === 1;
}

// When the editor already auto-closed the bracket, drop ours so it isn't doubled.
function withoutClosing(snippet, closing) {
	return snippet.endsWith(closing) ? snippet.slice(0, -closing.length) : snippet;
}

/**
 * Completions at `offset` in `text`.
 * @returns {{ from: number, to: number, items: object[] } | null} offsets into `text`
 */
function complete(flavor, text, offset) {
	const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
	const before = text.slice(lineStart, offset);
	const nextChar = text.slice(offset, offset + 1);
	const result = (start, items, to = offset) => ({ from: lineStart + start, to, items });

	const escape = /\\[A-Za-z0-9{<]*$/.exec(before);
	if (escape) {
		// `\\` is an escaped backslash, not the start of an escape sequence.
		if (isEscaped(before, escape.index)) return null;
		const items = ESCAPES.filter(([, , flavors]) => flavors.includes(flavor)).map(([label, detail, , snippet]) =>
			item(label, detail, snippet),
		);
		if (flavor !== PY) {
			for (const name of namedGroups(text)) items.push(item(`\\k<${name}>`, "back-reference", null, "reference", 1));
		}
		return result(escape.index, items);
	}

	const group = /\((?:\?[A-Za-z<'=!:#>&(P-]*|\*[A-Z]*)$/.exec(before);
	if (group && !isEscaped(before, group.index)) {
		const fix = (snippet) => (nextChar === ")" ? withoutClosing(snippet, ")") : snippet);
		const items = GROUPS.filter(([, , flavors]) => flavors.includes(flavor)).map(([label, detail, , snippet]) =>
			item(label, detail, fix(snippet)),
		);
		if (flavor === PCRE) {
			for (const verb of VERBS) items.push(item(`(*${verb})`, "backtracking verb", fix(`(*${verb})`)));
		}
		for (const name of namedGroups(text)) {
			if (flavor === PCRE) items.push(item(`(?&${name})`, "recurse group", fix(`(?&${name})`), "reference", 1));
			if (flavor === PY) items.push(item(`(?P=${name})`, "back-reference", fix(`(?P=${name})`), "reference", 1));
		}
		return result(group.index, items);
	}

	if (flavor === PCRE) {
		const posix = /\[:[a-z]*$/.exec(before);
		if (posix) {
			// `[[` with auto-closing leaves `]]` ahead; one of them is ours.
			const to = text.slice(offset, offset + 2) === "]]" ? offset + 1 : offset;
			return result(
				posix.index,
				POSIX.map((name) => item(`[:${name}:]`, "POSIX class", null, "constant")),
				to,
			);
		}
	}

	return null;
}

const FIELD = /\$\{(?:(\d+)(?::([^{}]*))?|([^{}]*))\}/g;
const escapeSnippetText = (s) => s.replace(/[\\$}]/g, "\\$&");

/** Converts a template to VS Code snippet syntax; a final empty field becomes `$0`. */
function toSnippet(template) {
	const fields = [...template.matchAll(FIELD)];
	let out = "";
	let last = 0;
	fields.forEach((m, i) => {
		out += escapeSnippetText(template.slice(last, m.index));
		const text = m[2] ?? m[3] ?? "";
		const isFinal = i === fields.length - 1 && text === "";
		out += isFinal ? "$0" : text ? `\${${i + 1}:${escapeSnippetText(text)}}` : `$${i + 1}`;
		last = m.index + m[0].length;
	});
	return out + escapeSnippetText(template.slice(last));
}

module.exports = { complete, toSnippet, FLAVORS: [PCRE, JS, PY] };
