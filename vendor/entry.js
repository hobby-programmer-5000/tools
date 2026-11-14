import twttr from "twitter-text";
import { parse as parseEmoji } from "twemoji-parser";
export const parseTweet = twttr.parseTweet;
export const configs = twttr.configs;
export const extractUrlsWithIndices = twttr.extractUrlsWithIndices;
export { parseEmoji };
