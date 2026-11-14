// Counting logic for the X post length counter. No DOM here, so it can be tested in Node.
// The official number always comes from twitter-text's parseTweet. The breakdown walks
// the text the same way parseTweet does, and a test checks that the two always agree.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.XCounter = factory(root.twttrText);
})(typeof self !== "undefined" ? self : this, function (tt) {
  "use strict";

  const LIMITS = { standard: 280, premium: 25000 };
  const base = tt.configs.defaults;
  // Characters X refuses to post (twitter-text's invalid_chars_group).
  const INVALID = /[\uFFFE\uFEFF\uFFFF]/;

  function configFor(limit) {
    return Object.assign({}, base, { maxWeightedTweetLength: limit });
  }

  function weightOf(codePoint) {
    for (const r of base.ranges) {
      if (codePoint >= r.start && codePoint <= r.end) return r.weight;
    }
    return base.defaultWeight;
  }

  // Splits the text into what X counts: 1-unit characters, 2-unit characters,
  // links (a fixed 23 each) and emoji (2 each). Indices are UTF-16, like JS strings.
  // With a limit, also finds where the text stops fitting (cutAt), walking the same way.
  // parseTweet's validRangeEnd cannot be used for that: it stops at the first character
  // X rejects, so one invisible U+FEFF would mark the whole post as cut off.
  function breakdown(text, limit) {
    const maxUnits = (limit || Infinity) * base.scale;
    const urls = tt.extractUrlsWithIndices(text, { extractUrlsWithoutProtocol: true });
    const emoji = base.emojiParsingEnabled ? tt.parseEmoji(text) : [];
    const urlAt = new Map(urls.map((u) => [u.indices[0], u.indices[1]]));
    const emojiAt = new Map(emoji.map((e) => [e.indices[0], e.indices[1]]));

    const out = { single: 0, double: 0, other: 0, otherUnits: 0, links: 0, emoji: 0, units: 0, cutAt: -1 };
    const add = (at, units) => {
      if (out.cutAt < 0 && out.units + units > maxUnits) out.cutAt = at;
      out.units += units;
    };
    let i = 0;
    while (i < text.length) {
      if (urlAt.has(i)) {
        out.links += 1;
        add(i, base.transformedURLLength * base.scale);
        i = urlAt.get(i);
        continue;
      }
      if (emojiAt.has(i)) {
        out.emoji += 1;
        add(i, base.defaultWeight);
        i = emojiAt.get(i);
        continue;
      }
      const cp = text.codePointAt(i);
      const w = weightOf(cp);
      if (w === base.scale) out.single += 1;
      else if (w === base.scale * 2) out.double += 1;
      else { out.other += 1; out.otherUnits += w / base.scale; }
      add(i, w);
      i += cp > 0xffff ? 2 : 1;
    }
    out.weighted = Math.ceil(out.units / base.scale);
    return out;
  }

  function analyze(rawText, limit) {
    limit = limit || LIMITS.standard;
    // parseTweet works on NFC text; show and cut that same text so indices line up.
    const text = (rawText || "").normalize("NFC");
    const parsed = tt.parseTweet(text, configFor(limit));
    const parts = breakdown(text, limit);
    const over = parsed.weightedLength > limit;
    return {
      text,
      limit,
      weighted: parsed.weightedLength,
      remaining: limit - parsed.weightedLength,
      over,
      empty: text.length === 0,
      // X will not post text that is only spaces and line breaks.
      blank: text.length > 0 && text.trim().length === 0,
      // X will not post text containing U+FFFE, U+FEFF or U+FFFF (often an invisible BOM).
      invalid: INVALID.test(text),
      valid: parsed.valid,
      // Index (UTF-16, in `text`) where the cut-off part starts, or -1 when it all fits.
      cutAt: over ? parts.cutAt : -1,
      ratio: Math.min(parsed.weightedLength / limit, 1),
      parts,
    };
  }

  return { LIMITS, analyze, breakdown };
});
