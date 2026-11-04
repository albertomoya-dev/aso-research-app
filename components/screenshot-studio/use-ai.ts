"use client";

import { useState, useTransition } from "react";
import {
  type BackgroundImageResult,
  type CopyResult,
  deleteGeneratedImage,
  generateBackgroundImage,
  generateBackgroundPrompts,
  generateScreenshotCopy,
  type LogoPromptResult,
} from "@/app/asset-actions";
import { fitVisionPayload, screenThumbnail } from "@/lib/assets/screenshot-render";
import type { Studio } from "./use-studio";

export type BackgroundIdea = { name: string; prompt: string; rationale: string };

/** Claude's copy for every screen, and the AI backdrops (Claude's prompt ideas and the image provider). */
export function useAi(studio: Studio) {
  const { spec, setSpec, setStatus, imageFor, update, appPalette, usePalette, props } = studio;
  const { appId } = props;
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [writing, startWriting] = useTransition();
  const [sendScreens, setSendScreens] = useState(true);
  const [backgrounds, setBackgrounds] = useState(props.backgrounds);
  const [bgFocus, setBgFocus] = useState("");
  const [bgPrompts, setBgPrompts] = useState<BackgroundIdea[]>([]);
  const [bgPrompt, setBgPrompt] = useState("");
  const [bgWriting, startBgWriting] = useTransition();
  const [bgGenerating, startBgGenerating] = useTransition();

  /** Small images of every screen, for Claude to see them (null where a slide has no image). */
  async function screensForClaude(): Promise<(string | null)[]> {
    return Promise.all(
      spec.slides.map(async (sl) => {
        const img = await imageFor(sl.image).catch(() => null);
        if (!img) return null;
        try {
          return screenThumbnail(img, sl.asIs ? null : sl.crop);
        } catch {
          return null;
        }
      }),
    );
  }

  function writeCopy() {
    setStatus(null);
    startWriting(async () => {
      // Checked here too: a body over the server action limit would fail before the action answers.
      const screens = sendScreens ? fitVisionPayload(await screensForClaude()) : [];
      const result: CopyResult = await generateScreenshotCopy(
        appId,
        spec.slides.map((s) => ({ headline: s.headline, subheadline: s.subheadline })),
        focus,
        screens,
      );
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setSpec((s) => ({
        ...s,
        slides: s.slides.map((sl, i) => {
          const c = result.slides[i];
          return c ? { ...sl, headline: c.headline, subheadline: c.subheadline, keyword: c.keyword || null } : sl;
        }),
      }));
      setNotes(result.notes);
      setStatus({ kind: "ok", text: `Textos redactados por ${result.model}.` });
    });
  }

  function proposeBackgrounds() {
    setStatus(null);
    startBgWriting(async () => {
      const t = spec.theme;
      const dark =
        parseInt(t.background.slice(1, 3), 16) * 0.299 +
          parseInt(t.background.slice(3, 5), 16) * 0.587 +
          parseInt(t.background.slice(5, 7), 16) * 0.114 <
        128;
      const result: LogoPromptResult = await generateBackgroundPrompts(appId, bgFocus, {
        dark,
        background: t.background,
        accent: t.accent,
        palette: usePalette && appPalette.length ? appPalette : undefined,
      });
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setBgPrompts(result.prompts);
      setBgPrompt(result.prompts[0]?.prompt ?? "");
    });
  }

  function generateBackground() {
    setStatus(null);
    startBgGenerating(async () => {
      const result: BackgroundImageResult = await generateBackgroundImage(
        appId,
        bgPrompt,
        usePalette && appPalette.length ? appPalette : undefined,
      );
      if ("error" in result) {
        setStatus({ kind: "error", text: result.error });
        return;
      }
      setBackgrounds((b) => [{ id: result.id, prompt: bgPrompt }, ...b]);
      update({ backgroundImage: result.url });
      setStatus({ kind: "ok", text: `Fondo generado con ${result.provider} (${result.model}).` });
    });
  }

  async function removeBackground(id: number) {
    const url = `/api/assets/generated/${id}`;
    setBackgrounds((b) => b.filter((x) => x.id !== id));
    if (spec.backgroundImage === url) update({ backgroundImage: null });
    await deleteGeneratedImage(appId, id);
  }

  return {
    focus,
    setFocus,
    notes,
    writing,
    sendScreens,
    setSendScreens,
    writeCopy,
    backgrounds,
    bgFocus,
    setBgFocus,
    bgPrompts,
    bgPrompt,
    setBgPrompt,
    bgWriting,
    bgGenerating,
    proposeBackgrounds,
    generateBackground,
    removeBackground,
  };
}

export type Ai = ReturnType<typeof useAi>;
