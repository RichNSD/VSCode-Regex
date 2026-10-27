const vscode = require("vscode");
const { complete, toSnippet } = require("./completions");

const FLAVOR_BY_LANGUAGE = {
	regexp: "pcre",
	"regexp-javascript": "javascript",
	"regexp-python": "python",
};

// `<` keeps the list open while typing `\k<`.
const TRIGGER_CHARACTERS = ["\\", "?", "*", ":", "<"];

const KINDS = {
	keyword: vscode.CompletionItemKind.Keyword,
	constant: vscode.CompletionItemKind.Constant,
	reference: vscode.CompletionItemKind.Reference,
};

function provider(flavor) {
	return {
		provideCompletionItems(document, position) {
			const text = document.getText();
			const result = complete(flavor, text, document.offsetAt(position));
			if (!result) return undefined;
			const range = new vscode.Range(document.positionAt(result.from), document.positionAt(result.to));
			return result.items.map((entry, index) => {
				const completion = new vscode.CompletionItem(entry.label, KINDS[entry.kind]);
				completion.detail = entry.detail;
				completion.range = range;
				completion.filterText = entry.label;
				completion.insertText = entry.snippet ? new vscode.SnippetString(toSnippet(entry.snippet)) : entry.label;
				// Keep the list in table order, with named groups from the document first.
				completion.sortText = `${entry.boost ? 0 : 1}${String(index).padStart(3, "0")}`;
				return completion;
			});
		},
	};
}

function activate(context) {
	for (const [language, flavor] of Object.entries(FLAVOR_BY_LANGUAGE)) {
		context.subscriptions.push(
			vscode.languages.registerCompletionItemProvider({ language }, provider(flavor), ...TRIGGER_CHARACTERS),
		);
	}
}

function deactivate() {}

module.exports = { activate, deactivate };
