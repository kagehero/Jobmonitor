"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

function fullPath(pathname: string, search: URLSearchParams): string {
  const q = search.toString();
  return q.length ? `${pathname}?${q}` : pathname;
}

/**
 * Same-origin のリンク遷移を検知し、画面上端に細いインディケーターを出す。
 * `useSearchParams` のため、呼び出し側で Suspense で包んだ `NavigationProgress` を使う。
 */
function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = fullPath(pathname, searchParams);

  const [active, setActive] = React.useState(false);
  const routeRef = React.useRef(key);

  React.useEffect(() => {
    routeRef.current = key;
    setActive(false);
  }, [key]);

  React.useEffect(() => {
    function onMouseDown(ev: MouseEvent) {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

      const el = ev.target as Element | null;
      const anchor = el?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.dataset.skipNavProgress !== undefined) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const hrefRaw = anchor.getAttribute("href");
      if (!hrefRaw || hrefRaw.startsWith("#")) return;
      if (hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:")) return;

      let url: URL;
      try {
        url = new URL(hrefRaw, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const nextKey = `${url.pathname}${url.search}`;
      if (nextKey === routeRef.current) return;
      setActive(true);
    }

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, []);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Page navigation in progress"
    >
      <div className="app-nav-progress-shimmer h-full w-full opacity-95" />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <React.Suspense fallback={null}>
      <NavigationProgressInner />
    </React.Suspense>
  );
}
