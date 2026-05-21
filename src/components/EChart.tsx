import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

// ECharts hands us a heavy params object; views narrow it themselves. We
// accept any shape so each call site can declare what it actually needs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (params: any) => void;

interface EChartProps {
  option: echarts.EChartsOption;
  className?: string;
  style?: React.CSSProperties;
  /** ECharts event handlers — `click`, `mouseover`, etc. Wired on first mount. */
  onEvents?: Record<string, EventHandler>;
}

export function EChart({ option, className, style, onEvents }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  const handlersRef = useRef<Record<string, EventHandler>>({});

  useEffect(() => {
    if (!ref.current) return;
    instance.current = echarts.init(ref.current, 'dark');
    const ro = new ResizeObserver(() => instance.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      instance.current?.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    instance.current?.setOption(option, { notMerge: true });
  }, [option]);

  // Re-bind event handlers when they change. Use a stable wrapper so we can
  // hot-swap the underlying handler without re-binding echarts.
  useEffect(() => {
    const inst = instance.current;
    if (!inst) return;
    // Detach old.
    for (const evt of Object.keys(handlersRef.current)) {
      inst.off(evt);
    }
    handlersRef.current = onEvents ?? {};
    for (const [evt, fn] of Object.entries(handlersRef.current)) {
      inst.on(evt, fn);
    }
  }, [onEvents]);

  return <div ref={ref} className={className ?? 'chart'} style={style} />;
}
