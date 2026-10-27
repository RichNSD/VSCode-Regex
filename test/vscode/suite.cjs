const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

async function open(name, text) {
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "regex-doc-")), name);
	fs.writeFileSync(file, text);
	const document = await vscode.workspace.openTextDocument(file);
	await vscode.window.showTextDocument(document);
	return document;
}

async function tokens(document) {
	// Internal command VS Code's own grammar tests use; returns [{ c: text, t: scopes }].
	for (let attempt = 0; attempt < 20; attempt++) {
		const result = await vscode.commands.executeCommand("_workbench.captureSyntaxTokens", document.uri);
		if (result?.length) return result;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error("no tokens");
}

async function completionLabels(document, line, character, trigger) {
	const list = await vscode.commands.executeCommand(
		"vscode.executeCompletionItemProvider",
		document.uri,
		new vscode.Position(line, character),
		trigger,
	);
	return list.items.map((i) => (typeof i.label === "string" ? i.label : i.label.label));
}

const checks = [
	["detects .re and .regex files", async () => {
		assert.equal((await open("test.re", "a")).languageId, "regexp");
		assert.equal((await open("Patterns.REGEX", "a")).languageId, "regexp");
		assert.equal((await open("notes.txt", "a")).languageId, "plaintext");
	}],
	["highlights with the generated grammar", async () => {
		const doc = await open("highlight.re", String.raw`^(?<year>\d{4})[a-z]\.x|+`);
		const scopesOf = (text) => (tokensList.find((t) => t.c === text) || {}).t || "";
		const tokensList = await tokens(doc);
		assert.match(scopesOf("^"), /source\.regexp .*keyword\.control\.anchors\.regexp/);
		assert.match(scopesOf("year"), /entity\.name\.capture-group\.regexp/);
		assert.match(scopesOf("a-z"), /constant\.other\.range\.regexp/);
		assert.match(scopesOf("\\."), /constant\.character\.escape\.regexp/);
		assert.match(scopesOf("+"), /invalid\.illegal\.unexpected-quantifier\.regexp/);
	}],
	["flavours via files.associations", async () => {
		await vscode.workspace
			.getConfiguration()
			.update("files.associations", { "*.jsre": "regexp-javascript", "*.pyre": "regexp-python" }, vscode.ConfigurationTarget.Global);
		const js = await open("a.jsre", "(?:a)");
		assert.equal(js.languageId, "regexp-javascript");
		assert.ok((await tokens(js)).some((t) => /^source\.regexp\.js .*punctuation\.definition\.group\.no-capture/.test(t.t)));
		const py = await open("a.pyre", "(?P<w>a)");
		assert.equal(py.languageId, "regexp-python");
		assert.ok((await tokens(py)).some((t) => /^source\.regexp\.py .*entity\.name\.section\.group/.test(t.t)));
	}],
	["ignores escaped and in-set brackets when matching", async () => {
		const doc = await open("brackets.re", "(a\\)[)]b)");
		const editor = vscode.window.activeTextEditor;
		editor.selection = new vscode.Selection(0, 0, 0, 0);
		await new Promise((r) => setTimeout(r, 300));
		await vscode.commands.executeCommand("editor.action.jumpToBracket");
		assert.equal(doc.getText(), "(a\\)[)]b)");
		assert.equal(editor.selection.active.character, 8, "matched the final )");
	}],
	["completes escapes, groups and named groups", async () => {
		const doc = await open("complete.re", "(?<year>\\d)\\\n(?");
		const escapes = await completionLabels(doc, 0, 12, "\\");
		assert.ok(escapes.includes("\\d"));
		assert.ok(escapes.includes("\\k<year>"));
		const groups = await completionLabels(doc, 1, 2, "?");
		assert.ok(groups.includes("(?:…)"));
		assert.ok(groups.includes("(?&year)"));
	}],
	["extension activated without errors", async () => {
		const ext = vscode.extensions.getExtension("richnsd.regular-expression");
		assert.ok(ext?.isActive);
	}],
];

exports.run = async () => {
	let failed = 0;
	for (const [name, fn] of checks) {
		try {
			await fn();
			console.log(`✔ ${name}`);
		} catch (error) {
			failed++;
			console.log(`✖ ${name}\n  ${error.stack || error}`);
		}
	}
	if (failed) throw new Error(`${failed} VS Code check(s) failed`);
};
