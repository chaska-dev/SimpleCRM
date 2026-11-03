/**
 * useImageFade — load state of an <img> for the 200 ms fade (spec v7 O).
 *
 *   const { status, imgProps } = useImageFade(url);
 *   <img src={url} {...imgProps} />        // clase .img-fade + data-loaded
 *
 * - `status`: "loading" | "loaded" | "error". Changing `src` goes back to "loading".
 * - Handles images that were already cached before hydrating (`complete`), so they
 *   do not stay invisible waiting for a `load` that never arrives.
 * - The fade lives in `.img-fade` (global.css); with prefers-reduced-motion there is no transition.
 */
import { useCallback, useState } from "react";

export type ImageStatus = "loading" | "loaded" | "error";

export function useImageFade(src: string) {
  const [state, setState] = useState<{ src: string; status: ImageStatus }>({
    src,
    status: "loading",
  });
  const status: ImageStatus = state.src === src ? state.status : "loading";

  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (img && img.complete) {
        setState({ src, status: img.naturalWidth > 0 ? "loaded" : "error" });
      }
    },
    [src],
  );

  return {
    status,
    imgProps: {
      ref,
      className: "img-fade",
      "data-loaded": status === "loaded" ? "true" : "false",
      onLoad: () => setState({ src, status: "loaded" }),
      onError: () => setState({ src, status: "error" }),
    },
  };
}
