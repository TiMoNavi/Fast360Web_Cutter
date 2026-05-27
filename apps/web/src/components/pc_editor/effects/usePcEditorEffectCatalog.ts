"use client";

import { useEffect, useState } from "react";
import {
  catalogToPanelCategories,
  fetchPcEditorEffectCatalog
} from "./effectCatalogClient";
import type { PcEditorEffectPanelCategory } from "./types";

export function usePcEditorEffectCatalog(fallbackCategories: PcEditorEffectPanelCategory[]) {
  const [categories, setCategories] = useState(fallbackCategories);
  const [status, setStatus] = useState<"fallback" | "loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    fetchPcEditorEffectCatalog()
      .then((catalog) => {
        if (cancelled) {
          return;
        }

        setCategories(catalogToPanelCategories(catalog));
        setStatus("ready");
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }

        setCategories(fallbackCategories);
        setStatus("error");
        setError(caught instanceof Error ? caught.message : String(caught));
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackCategories]);

  return {
    categories,
    error,
    status
  };
}
