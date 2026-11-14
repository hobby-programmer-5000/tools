**English** | [한국어](README.ko.md)

# tools

Small web tools by [HobbyProgrammer5000](https://hobby-programmer-5000.github.io) that run right in your browser.
Nothing you type is sent anywhere.

**Open: https://hobby-programmer-5000.github.io/tools/**

## Tools

### X post length counter — [`/tools/x-counter/`](https://hobby-programmer-5000.github.io/tools/x-counter/)

Counts a post the way X does, and shows where a long post gets cut.

- Uses X's own open-source counting library, [twitter-text](https://github.com/twitter/twitter-text), so the number matches what X shows.
- Korean, Chinese and Japanese characters count as 2, every link as 23, every emoji as 2.
- Switch between the standard 280 limit and the Premium 25,000 limit.
- "Why this number" shows how much each kind of character added; the parts always add up to the total.
- Past the limit, the part that would be cut off is highlighted.
- Copy (Ctrl+Enter), clear with undo, and a draft that stays in this browser only.
- English and Korean, light and dark.

### Scrollfold — [`/tools/scrollfold/`](https://hobby-programmer-5000.github.io/tools/scrollfold/)

Splits one wide image into up to 20 equal strips for an X multi-image post, and previews how they line up.

- Strip ratio presets measured from real X posts, crop or pad (never stretch), "Optimize for X" (≤ 4096 px, ≤ 5 MB JPEG).
- The image is processed in your browser and never uploaded. Results download as a `.zip`.
- This is only the browser version. The full app, with a desktop app and a local mode that saves straight to a folder
  and opens more formats (TIFF, TGA, JPEG 2000 …), is at **[hobby-programmer-5000/scrollfold](https://github.com/hobby-programmer-5000/scrollfold)**.
- The page here uses this site's look. Its splitting logic, `scrollfold/split.js`, is copied unchanged from that repository's `web/split.js`; change it there, then copy it here.

## Why I made this

Writing on X in Korean and English, a post fills up much faster than it looks: every Hangul syllable counts as 2.
I wanted to see the real number, and why, before posting.

## Run it locally

```bash
node --test
python -m http.server 8766
```

Then open http://127.0.0.1:8766/. There is no build step.

## How it is checked

`test/counter.test.mjs` runs against the same vendored library the page loads. It checks 280/281 Latin characters,
140/141 Hangul, links at 23, joined emoji at 2, the cut point, the 25,000 Premium limit, and that the breakdown
adds up to the official count on 512 strings, 500 of them random. GitHub Actions runs the tests and deploys only if they pass.

## Project layout

```
index.html, assets/      tool list and shared look, language and theme
assets/i18n.js           every UI string, English and Korean
tools.json               the list of tools (the landing page reads it too)
x-counter/               the X post length counter (counter.js is the logic, app.js the page)
scrollfold/              Scrollfold page (split.js is copied from hobby-programmer-5000/scrollfold; edit it there)
vendor/                  twitter-text bundle, its licenses, and how it was built
test/                    node:test
```

## Credits

See [CREDITS.md](CREDITS.md) for the bundled library, fonts and icons, and [REFERENCES.md](REFERENCES.md) for the rules each tool follows.

## Contributors

- **HobbyProgrammer5000**: idea, choice of tools, requirements, review
- **Claude** (Anthropic): design, implementation, tests, documentation

## License

The code written for this repository is under the [MIT License](LICENSE).
The bundled twitter-text library keeps its Apache-2.0 license, and its dependencies keep theirs (MIT); see [vendor/](vendor/README.md).
The profile picture used as the favicon is not covered.
