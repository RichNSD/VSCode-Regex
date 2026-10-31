# Regular Expression for VS Code

A **Regular Expression** language for VSCode, adapted from the Sublime Text definitions that Textastic uses. Open a `.re` or `.regex` file and you get syntax highlighting for the regex itself, as a scratchpad for writing and checking long expressions. It doesn't run, test or evaluate anything, and it doesn't add highlighting to other languages.

This is the VSCode companion to the [Acode plugin](https://github.com/RichNSD/Acode-Regex) and (generally) behaves the same way.

## Features

- **Highlighting** from the original `RegExp.sublime-syntax` (PCRE syntax, the definition Sublime and Textastic bind to `.re`), including:
  groups, named groups, lookarounds, inline modes such as `(?i)`, conditionals, recursion, backtracking verbs, character sets with ranges and POSIX classes, escapes, quantifiers (lazy and possessive), back-references, `(?#…)` comments, `#` comments in `(?x)` mode, and errors such as a leading quantifier or an unmatched `)`.
- **File types:** `.re` (from the Sublime definition) and `.regex`.
- **Other flavours:** *Regular Expression (JavaScript)* and *Regular Expression (Python)* come from Sublime's two embedded regex syntaxes. They aren't tied to a file extension. Choose them with **Change Language Mode**, or map your own extensions with `files.associations`:
  ```json
  "files.associations": { "*.jsre": "regexp-javascript", "*.pyre": "regexp-python" }
  ```
- **Completions** appear only after regex-specific prefixes, and each flavour
  gets its own list:
  - `\` gives escapes and classes (`\d`, `\p{…}`, `\k<name>`, …)
  - `(?` gives group constructs (`(?:…)`, `(?<name>…)`, `(?<=…)`, `(?(1)…|…)`, …)
  - `(*` gives backtracking verbs
  - `[:` inside a set gives POSIX classes

  Named groups you've already written are offered as back-references.
- **File icon** for regex files in the Explorer and tabs. File icon themes that
  have no icon of their own for these files fall back to it, including the
  default Seti theme.
- **Brackets:** `(`, `[` and `{` auto-close, but quotes don't, because quotes in a regex are literal characters. Escaped brackets such as `\(` and brackets inside sets such as `[(]` are ignored when matching and colourising bracket pairs.

Colours come from your VS Code theme, which applies them to the Sublime scope
names directly, as Textastic does.

> [!IMPORTANT] 
> ### AI Transparency Notice
> This is my first time building an extension/plugin for either Acode or VSCode and I'm trying to use these extensions as a learning experience. So far all of my (self-taught) coding experience has been in the troubleshooting, editing, and fixing of things other people have built from scratch. So, I will admit that Claude Code has done basically all of the work during the initial builds on both versions of this extension as I learn how everything works. However, going forward, the goal is to use as little AI as possible because my goal is to learn how to *actually* be a developer. 
>
> The logo/icon is something I designed myself though. :sunglasses: The design files are free for anyone to use and play with in the repo, you can find them in the `/design` folder, and you can edit them with the awesome new open-source version of Adobe Illustrator: [VectorCraft](https://getartcraft.com/apps/vectorcraft)


## Build and install

Requires Node.js 18+ and VS Code 1.75+.

```sh
npm install
npm test           # grammar and completion tests
npm run package    # writes regular-expression-<version>.vsix
```

Install the `.vsix`: open the Extensions view, then **⋯ → Install from VSIX…**
and pick the file. Alternatively, run
`code --install-extension regular-expression-1.0.0.vsix`.

To try changes without installing, open this folder in VS Code and press
**F5**. A second window opens with the extension loaded and `examples/` open.

## Development

- `sublime/` holds the original definitions extracted from Textastic. They are
  used unchanged.
- `scripts/build-grammars.mjs` generates the TextMate grammars in `syntaxes/`
  from them (`npm run build`). VS Code and Sublime both use Oniguruma, so the
  patterns carry over as-is. The JavaScript and Python syntaxes convert
  mechanically. The main PCRE syntax relies on Sublime's `set` contexts, which
  TextMate doesn't have, so it is ported rule by rule in the same order. Don't
  edit `syntaxes/` by hand: `npm test` fails if the files there are out of date.
- `src/completions.js` holds the completion logic and has no VS Code
  dependency. `src/extension.js` connects it to VS Code.
- `npm run test:vscode` launches VS Code with a throwaway profile and checks
  file detection, highlighting, bracket matching and completions in the real
  editor. It uses `/Applications/Visual Studio Code.app` if it exists;
  otherwise set `VSCODE_PATH`, or let it download a copy.
