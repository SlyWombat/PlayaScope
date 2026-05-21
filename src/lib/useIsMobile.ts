import { useEffect, useState } from 'react';

// Tracks whether the viewport is at or below a mobile breakpoint.
// Used to feed responsive options into ECharts (which can't do CSS media
// queries itself) — e.g. shrinking grid.left so horizontal-bar charts don't
// give 60% of a phone screen to the axis labels.
export function useIsMobile(breakpoint = 720): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}
