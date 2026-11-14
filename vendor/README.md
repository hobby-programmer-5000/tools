# vendor

`twitter-text-3.1.0.bundle.js` is X's official open-source counting library, [twitter-text](https://github.com/twitter/twitter-text) 3.1.0,
bundled into one browser file together with the emoji parser it uses. It exposes a global `twttrText` with
`parseTweet`, `configs`, `extractUrlsWithIndices` and `parseEmoji`.

It is committed so the site has no build step and loads no third-party script at run time.
(The pages do load fonts from jsDelivr and the favicon from GitHub's avatar service. What you type is shown
only in system fonts, so typing never makes the browser fetch anything.)

## How it was made

In an empty folder outside this repository:

```bash
npm init -y
npm i --ignore-scripts twitter-text@3.1.0 esbuild@0.24.2
# copy vendor/entry.js here, then:
node node_modules/esbuild/bin/esbuild entry.js --bundle --minify --format=iife --global-name=twttrText --target=es2019 --legal-comments=eof --outfile=twitter-text.bundle.js
```

Then a two-line license header was added at the top.
Install scripts were off (`--ignore-scripts`); none are needed for bundling.
A scan of the bundle found no network calls (`fetch`, `XMLHttpRequest`) and no `eval`.
The URLs inside it are string constants for link and emoji helpers that this site does not call.

## What is inside, and licenses

| Package | Version | License | Text |
|---|---|---|---|
| twitter-text | 3.1.0 | Apache-2.0, © Twitter, Inc. | `licenses/twitter-text-LICENSE.txt` |
| twemoji-parser | 11.0.2 | MIT | `licenses/twemoji-parser-LICENSE.md` |
| punycode | 1.4.1 | MIT | `licenses/punycode-LICENSE-MIT.txt` |
| @babel/runtime | 7.29.14 | MIT | `licenses/babel-runtime-LICENSE.txt` |
| core-js | 2.6.12 | MIT | `licenses/core-js-LICENSE.txt` |

The bundle was not modified apart from the header. twitter-text ships no NOTICE file.
