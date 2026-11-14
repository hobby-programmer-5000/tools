# References

## X post length counter

| Source | What it settles |
|---|---|
| X developer docs, [Counting characters](https://docs.x.com/fundamentals/counting-characters) | The weighting rules: most characters weigh 1 or 2, links count as 23, emoji as 2, text is NFC-normalized. |
| [twitter-text](https://github.com/twitter/twitter-text) 3.1.0, `configs` v3 | The exact weight ranges (U+0000–U+10FF, U+2000–U+200D, U+2010–U+201F, U+2032–U+2037 weigh 1; everything else 2) and the 280 limit. The tool uses this library for the count itself. |
| X Help Center, [longer posts](https://help.x.com/articles/232427) | Premium subscribers can post up to 25,000 characters. (The help center blocks automated readers, so this figure was confirmed through search results quoting it, not by opening the page.) |

## Design

The look follows the landing page, whose design sources are listed in its
[REFERENCES.md](https://github.com/hobby-programmer-5000/hobby-programmer-5000.github.io/blob/main/REFERENCES.md)
(GitHub Primer, Material Design 3, Apple HIG, WCAG 2.2, and the personal sites it learned from).
The segmented limit switch and the progress bar that turns yellow near the limit and pink past it are common patterns, not taken from a specific source.
