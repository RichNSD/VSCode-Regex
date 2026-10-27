/**
 * Runs suite.cjs inside a real VS Code with this extension loaded.
 * Uses the installed VS Code when found (set VSCODE_PATH to override);
 * otherwise @vscode/test-electron downloads one.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = path.dirname(fileURLToPath(import.meta.url));
const installed = "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
const vscodeExecutablePath = process.env.VSCODE_PATH || (fs.existsSync(installed) ? installed : undefined);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "regex-ext-test-"));
// Set when this runs from VS Code's integrated terminal; it would start the
// app as plain Node instead of the editor.
delete process.env.ELECTRON_RUN_AS_NODE;

try {
	await runTests({
		vscodeExecutablePath,
		extensionDevelopmentPath: path.resolve(here, "../.."),
		extensionTestsPath: path.join(here, "suite.cjs"),
		// A throwaway profile with no other extensions, so nothing interferes.
		launchArgs: ["--disable-extensions", `--user-data-dir=${profile}/user`, `--extensions-dir=${profile}/ext`, "--disable-workspace-trust"],
	});
} catch (error) {
	console.error(error);
	process.exitCode = 1;
} finally {
	fs.rmSync(profile, { recursive: true, force: true });
}
