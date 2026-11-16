# References

## X post length counter

| Source | What it settles |
|---|---|
| X developer docs, [Counting characters](https://docs.x.com/fundamentals/counting-characters) | The weighting rules: most characters weigh 1 or 2, links count as 23, emoji as 2, text is NFC-normalized. |
| [twitter-text](https://github.com/twitter/twitter-text) 3.1.0, `configs` v3 | The exact weight ranges (U+0000–U+10FF, U+2000–U+200D, U+2010–U+201F, U+2032–U+2037 weigh 1; everything else 2) and the 280 limit. The tool uses this library for the count itself. |
| X Help Center, [longer posts](https://help.x.com/articles/232427) | Premium subscribers can post up to 25,000 characters. (The help center blocks automated readers, so this figure was confirmed through search results quoting it, not by opening the page.) |

## Scrollfold

Its sources (the 15 measured X posts behind the strip ratios, X's image limits, UX guidelines) are listed in
[reference.md](https://github.com/hobby-programmer-5000/scrollfold/blob/main/reference.md) in its own repository.

## Photo Painter

| Source | What it settles |
|---|---|
| NinjaCodex (@N1njaCodex), X, 2026-11-15, [the post](https://x.com/N1njaCodex/status/2121670607314072032) and [its prompt](https://x.com/N1njaCodex/status/2121670780983611455) | The idea of a paint page that paints a photo by itself, the eight brush sizes (126 to 3 px), the four pass names, and what the page shows while painting (current size and color, the photo, stroke count, pause / restart / 1× / 3× / end). The prompt is not copied here, the code was written for this site, and the photo in the post is not used. |
| Aaron Hertzmann, [Painterly Rendering with Curved Brush Strokes of Multiple Sizes](https://mrl.cs.nyu.edu/publications/painterly98/), SIGGRAPH 98 | The method: layers from large brush to small, patch-wise comparison with a blurred photo, strokes along the normals of the luminance gradient, stopping where the painting is already closer. |
| Peter Litwinowicz, [Processing Images and Video for an Impressionist Effect](https://www.cs.princeton.edu/courses/archive/fall00/cs597b/papers/litwinowicz97.pdf), SIGGRAPH 97 | Stroke direction perpendicular to the image gradient; what to do in flat areas. |
| Paul Haeberli, [Paint by Numbers: Abstract Image Representations](https://history.siggraph.org/?p=122064), SIGGRAPH 90 | Picking colors from a photo to build a painting out of brush marks. |
| MDN, [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) | With reduced motion on, the finished painting is shown at once. |

Differences from Hertzmann's paper: strokes are round-capped polylines of 2 to 8 steps instead of splines; they are laid
roughly top to bottom instead of in random order; each brush size has a stroke budget; three box blurs stand in for a Gaussian.
The drop zone, file-name display, status line and buttons follow Scrollfold's page on this site.

## Meme Maker

| Source | What it settles |
|---|---|
| [Imgflip Meme Generator](https://imgflip.com/memegenerator), looked at 2026-11-16 | The common flow (pick a picture, add text boxes, save), per-box text settings (font, caps, outline, max size, alignment, opacity), adding a picture on top or below. Also what to leave out: its watermark is on by default and ads load as soon as you edit. |
| [iLoveIMG Meme generator](https://www.iloveimg.com/meme-generator), looked at 2026-11-16 | Text inside the picture or in a caption band outside it. |
| [georapbox/meme-generator](https://github.com/georapbox/meme-generator) (MIT) | A meme page that processes pictures in the browser only. No code is copied. |
| Place My Face (iOS) and YouCam “Face in Hole” | Putting your own face behind a hole in a template, which became the Hole tool. |
| Nobuyuki Otsu, “A Threshold Selection Method from Gray-Level Histograms”, IEEE Trans. SMC 9(1), 1979 | The starting cutoff between paper and ink for handwriting photos. |

All code was written for this site. No meme images, fonts or icons from these sources are used.

## Design

The look follows the landing page, whose design sources are listed in its
[REFERENCES.md](https://github.com/hobby-programmer-5000/hobby-programmer-5000.github.io/blob/main/REFERENCES.md)
(GitHub Primer, Material Design 3, Apple HIG, WCAG 2.2, and the personal sites it learned from).
The segmented limit switch and the progress bar that turns yellow near the limit and pink past it are common patterns, not taken from a specific source.
