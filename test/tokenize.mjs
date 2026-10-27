/**
 * Tokenizes text with the generated grammars using the same TextMate engine
 * and Oniguruma build that VS Code uses.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import vsctm from "vscode-textmate";
import oniguruma from "vscode-oniguruma";

const require = createRequire(import.meta.url);
const manifest = require("../package.json");

const wasm = fs.readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm"));
const onigLib = oniguruma.loadWASM(wasm.buffer).then(() => ({
	createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
	createOnigString: (s) => new oniguruma.OnigString(s),
}));

const grammarPaths = Object.fromEntries(
	manifest.contributes.grammars.map((g) => [g.scopeName, new URL(`../${g.path}`, import.meta.url)]),
);
export const scopeForLanguage = Object.fromEntries(manifest.contributes.grammars.map((g) => [g.language, g.scopeName]));

const registry = new vsctm.Registry({
	onigLib,
	loadGrammar: async (scopeName) => {
		const file = grammarPaths[scopeName];
		return file ? vsctm.parseRawGrammar(fs.readFileSync(file, "utf8"), file.pathname) : null;
	},
});

const grammars = new Map();
async function grammarFor(language) {
	if (!grammars.has(language)) grammars.set(language, await registry.loadGrammar(scopeForLanguage[language]));
	return grammars.get(language);
}

/** Returns [{ text, scopes, line, start }] for every token (scopes exclude the root). */
export async function tokenize(language, text) {
	const grammar = await grammarFor(language);
	let state = vsctm.INITIAL;
	const out = [];
	text.split("\n").forEach((line, lineIndex) => {
		const result = grammar.tokenizeLine(line, state);
		for (const token of result.tokens) {
			const tokenText = line.slice(token.startIndex, token.endIndex);
			if (tokenText) out.push({ text: tokenText, scopes: token.scopes.slice(1), line: lineIndex, start: token.startIndex });
		}
		state = result.ruleStack;
	});
	return out;
}

/** Scopes of the token containing the first occurrence of `needle` (after `from`). */
export async function scopesAt(language, text, needle, from = 0) {
	const index = text.indexOf(needle, from);
	if (index < 0) throw new Error(`"${needle}" not in text`);
	const line = text.slice(0, index).split("\n").length - 1;
	const column = index - (text.lastIndexOf("\n", index - 1) + 1);
	const tokens = await tokenize(language, text);
	const token = tokens.find((t) => t.line === line && t.start <= column && column < t.start + t.text.length);
	return token.scopes;
}
