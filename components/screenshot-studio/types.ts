import type { PublishedRef } from "@/lib/assets/bulk-upload";
import type { ScreenshotSpec } from "@/lib/assets/screenshots";
import type { Store } from "@/lib/stores/types";

export type ScreenshotStudioProps = {
  appId: number;
  appTitle: string;
  store: Store;
  initial: ScreenshotSpec;
  /** Screenshots published in the store, as proxied URLs. */
  storeImages: string[];
  aiEnabled: boolean;
  /** Name of the configured image provider, or null when none is set up. */
  providerLabel: string | null;
  /** Backdrops already generated for this app. */
  backgrounds: { id: number; prompt: string }[];
  /** Slides whose store screenshot should be scanned once for the app screen (the page could not do it). */
  detectSlides: string[];
  /** The app's icon (proxied URL), used with the screenshots to read the brand colours. */
  appIcon: string | null;
  /** When the design was last saved, already formatted on the server (see formatSavedAt). */
  savedAt: string | null;
  /** Version and last update of the published listing: uploaded screenshots older than it get a warning. */
  published: PublishedRef;
  /** `published.updatedAt` formatted on the server (see formatDayEs), for the warning. */
  publishedDate: string | null;
  /** Relevant tracked keywords, best first, suggested for the keyword of each screen. */
  keywordOptions: string[];
};

export type Status = { kind: "ok" | "error"; text: string } | null;

export type ImageMode = "raw" | "crop" | "asis";

export const PREVIEW_WIDTH = 230;
export const THUMB_WIDTH = 96;
