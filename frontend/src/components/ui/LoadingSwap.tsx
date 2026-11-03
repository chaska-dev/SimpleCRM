/**
 * LoadingSwap — skeleton <-> content transition (spec v7 N).
 *
 *   <LoadingSwap loading={loading} skeleton={<PersonDetailSkeleton />}>
 *     {content}
 *   </LoadingSwap>
 *
 * Behavior:
 *   - First load (`loading` true on the first render, SSR included): the skeleton is
 *     painted immediately, with no delay or fade; when the data arrives there is a 200 ms crossfade.
 *   - Later loads (refetch): the skeleton appears only if the load lasts longer than
 *     `delay` ms (120) and fades in over `duration` ms (200).
 *   - If the load finishes before the delay, the content enters with the same fade
 *     (opacity 0 -> 1, translateY 4px -> 0, ease-out) without showing the skeleton.
 *   - On a reload (loading goes back to true with previous content) the previous content
 *     stays visible during the delay, so the height does not collapse before the skeleton.
 *   - If the skeleton was already visible, 200 ms crossfade with both layers
 *     stacked in the same grid cell (no height jump).
 *   - `prefers-reduced-motion: reduce` disables movement and fades (instant
 *     change; the 120 ms delay is kept to avoid flicker).
 *
 * The animations live in `styles/global.css` (`.ls-*`).
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface LoadingSwapProps {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  /** ms before showing the skeleton. Default 120. */
  delay?: number;
  /** ms of the fade / crossfade. Default 200. */
  duration?: number;
  /** sr-only text announced (role=status) while the skeleton is visible. */
  label?: string;
  className?: string;
}

type Phase =
  | "waiting" // loading, skeleton still hidden (< delay)
  | "skeleton" // loading, skeleton visible
  | "swapping" // finishing: crossfade skeleton -> content
  | "content"; // content (direct entry with fade, or already stable)

export default function LoadingSwap({
  loading,
  skeleton,
  children,
  delay = 120,
  duration = 200,
  label,
  className = "",
}: LoadingSwapProps) {
  // First load (loading=true on the first render, SSR included): the skeleton is painted
  // immediately, with no delay or fade, so it already comes in the server HTML.
  // The 120 ms delay + fade applies only to later loads (refetch).
  const [phase, setPhase] = useState<Phase>(loading ? "skeleton" : "content");
  const [firstSkeleton, setFirstSkeleton] = useState(loading);
  // First render without loading (SSR / data already ready): no animation.
  const animateContent = useRef(loading);
  const prev = useRef(loading);
  // Last content already loaded: during a reload's delay it keeps being shown
  // (prevents the page from collapsing and jumping before the skeleton appears).
  const lastChildren = useRef<ReactNode>(null);
  const hasLast = useRef(false);
  if (!loading) {
    lastChildren.current = children;
    hasLast.current = true;
  }

  // Transitions on `loading` change.
  useEffect(() => {
    if (loading && !prev.current) {
      // New load (refetch with skeleton): wait for the delay again.
      animateContent.current = true;
      setFirstSkeleton(false);
      setPhase("waiting");
    } else if (!loading && prev.current) {
      animateContent.current = true;
      setPhase((p) => (p === "skeleton" ? "swapping" : "content"));
    }
    prev.current = loading;
  }, [loading]);

  // Skeleton appearance delay.
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = window.setTimeout(() => {
      setPhase((p) => (p === "waiting" ? "skeleton" : p));
    }, delay);
    return () => window.clearTimeout(id);
  }, [phase, delay]);

  // End of the crossfade: unmount the skeleton.
  useEffect(() => {
    if (phase !== "swapping") return;
    const id = window.setTimeout(() => {
      setPhase((p) => (p === "swapping" ? "content" : p));
    }, duration);
    return () => window.clearTimeout(id);
  }, [phase, duration]);

  const style = { "--ls-duration": `${duration}ms` } as CSSProperties;

  // Derived effective phase: avoids a frame with content when `loading` has just
  // switched to true (or with skeleton when it switches to false) before the effect runs.
  let eff: Phase;
  if (loading) eff = phase === "skeleton" ? "skeleton" : "waiting";
  else eff = phase === "skeleton" ? "swapping" : phase === "waiting" ? "content" : phase;

  // Same tree shape in all phases: the content layer keeps its
  // element (and its animation) when going from "swapping" to "content".
  const showSkeleton = eff === "skeleton" || eff === "swapping";
  const showStale = eff === "waiting" && hasLast.current;
  const showContent = eff === "swapping" || eff === "content" || showStale;

  return (
    <div
      className={[eff === "swapping" ? "ls-grid" : "", className]
        .join(" ")
        .trim()}
      style={style}
      aria-busy={loading || undefined}
    >
      {showSkeleton && (
        <div
          key="s"
          className={[
            "ls-layer",
            eff === "swapping" ? "ls-out" : firstSkeleton ? "" : "ls-in",
          ]
            .join(" ")
            .trim()}
          aria-hidden={eff === "swapping" || undefined}
          role={label && eff === "skeleton" ? "status" : undefined}
        >
          {label && eff === "skeleton" && <span className="sr-only">{label}</span>}
          {skeleton}
        </div>
      )}
      {showContent && (
        <div
          key="c"
          className={["ls-layer", animateContent.current && !showStale ? "ls-in" : ""]
            .join(" ")
            .trim()}
        >
          {showStale ? lastChildren.current : children}
        </div>
      )}
    </div>
  );
}
