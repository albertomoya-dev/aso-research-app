// `/a/[app]/[market]` will be the app's Resumen (phase 28). Until then it shows the keywords, the same
// page as `…/keywords` (one implementation, re-exported here).
import KeywordsPage, { generateMetadata } from "./keywords/page";

// Segment config is read from this file itself, so it is repeated rather than re-exported.
export const maxDuration = 120;

export { generateMetadata };
export default KeywordsPage;
