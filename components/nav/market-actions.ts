"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { refreshAppMeta, refreshRankings } from "@/app/actions";

const form = (appId: number) => {
  const fd = new FormData();
  fd.set("appId", String(appId));
  return fd;
};

const message = (error: unknown) => (error instanceof Error && error.message ? error.message : "No se ha podido completar.");

/**
 * «Actualizar posiciones» and «Actualizar ficha» of a market, from the header or the ⌘K palette:
 * the action runs in a transition with a toast, and the pages refresh when it revalidates.
 */
export function useMarketActions(appId: number | null) {
  const [refreshing, startRefresh] = useTransition();
  const [reading, startRead] = useTransition();
  return {
    refreshing,
    reading,
    refreshRankings() {
      if (!appId) return;
      startRefresh(async () => {
        const id = toast.loading("Consultando la tienda…");
        try {
          await refreshRankings(form(appId));
          toast.success("Posiciones actualizadas", { id });
        } catch (error) {
          toast.error(message(error), { id });
        }
      });
    },
    refreshListing() {
      if (!appId) return;
      startRead(async () => {
        const id = toast.loading("Leyendo la ficha…");
        try {
          await refreshAppMeta(form(appId));
          toast.success("Ficha actualizada", { id });
        } catch (error) {
          toast.error(message(error), { id });
        }
      });
    },
  };
}
