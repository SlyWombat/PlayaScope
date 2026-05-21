import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { GestureHandling } from 'leaflet-gesture-handling';
import 'leaflet-gesture-handling/dist/leaflet-gesture-handling.css';
import { densityByFestival } from '../data/aggregate';
import type { FestivalBundle } from '../data/loader';
import type { SanctionFlags } from '../data/sanctioned';

// Require two fingers (or ctrl+scroll) to pan/zoom the map, so a one-finger
// swipe scrolls the page instead of dragging the map. The plugin shows an
// on-screen hint when the user tries the wrong gesture. (Issue #10 / #12.)
L.Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

interface Props {
  bundles: FestivalBundle[];
  sanction: SanctionFlags | null;
  onOpenBurn?: (slug: string) => void;
}

export function GeoMap({ bundles, sanction, onOpenBurn }: Props) {
  const rows = useMemo(() => densityByFestival(bundles), [bundles]);
  const maxEvents = useMemo(() => Math.max(1, ...rows.map((r) => r.events)), [rows]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h2>World map — burn locations</h2>
        <div className="sub">
          Circle size scaled to event count. {rows.length} active burns. Click a marker for details.
        </div>
        <div className="map">
          <MapContainer
            center={[20, 0]}
            zoom={2}
            worldCopyJump
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
            // @ts-expect-error — gestureHandling is added by the plugin's init hook.
            gestureHandling
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {rows
              // Directory-sourced festivals have null coords — no map pin for
              // them (they still appear on Calendar / Data). Type guard so the
              // CircleMarker center sees plain numbers.
              .filter((r): r is typeof r & { lat: number; long: number } =>
                r.lat != null && r.long != null && Number.isFinite(r.lat) && Number.isFinite(r.long))
              .map((r) => {
                const radius = 6 + 18 * Math.sqrt(r.events / maxEvents);
                const isOfficial = sanction?.byFestival.get(r.festival)?.is_sanctioned ?? false;
                const color = isOfficial ? '#ff8a3d' : '#5a9dd1';
                return (
                  <CircleMarker
                    key={r.festival}
                    center={[r.lat, r.long]}
                    radius={radius}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.55, weight: 1 }}
                    eventHandlers={onOpenBurn ? { click: () => onOpenBurn(r.festival) } : undefined}
                  >
                    <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
                      <div style={{ fontFamily: 'Inter, sans-serif' }}>
                        <strong>
                          {isOfficial && '★ '}
                          {r.title}
                        </strong>
                        {isOfficial && <span style={{ color: '#ff8a3d', marginLeft: 6, fontSize: 11 }}>official</span>}
                        <br />
                        <span style={{ color: '#666' }}>{r.region}</span>
                        <br />
                        {r.events.toLocaleString()} events · {r.camps.toLocaleString()} camps · {r.art.toLocaleString()} art
                        <br />
                        {r.duration} days · {r.timeZone}
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}
          </MapContainer>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="panel">
          <h2>Duration distribution</h2>
          <div className="sub">How long burns run, in days.</div>
          <div className="chart short" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, padding: '8px 4px' }}>
            {(() => {
              const bins = new Map<number, number>();
              for (const r of rows) bins.set(r.duration, (bins.get(r.duration) ?? 0) + 1);
              const max = Math.max(1, ...bins.values());
              const keys = [...bins.keys()].sort((a, b) => a - b);
              return keys.map((k) => (
                <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    style={{
                      width: '60%',
                      minWidth: 18,
                      height: `${(bins.get(k)! / max) * 180}px`,
                      background: '#ff8a3d',
                      borderRadius: '4px 4px 0 0',
                    }}
                    title={`${bins.get(k)} burn(s) at ${k} days`}
                  />
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{k}d</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{bins.get(k)}</div>
                </div>
              ));
            })()}
          </div>
        </div>

        <div className="panel">
          <h2>Burns by region</h2>
          <div className="sub">Self-reported region string. Sorted by count.</div>
          <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Region</th>
                  <th className="num">Burns</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const m = new Map<string, number>();
                  for (const r of rows) m.set(r.region || '(unknown)', (m.get(r.region || '(unknown)') ?? 0) + 1);
                  return [...m.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([region, n]) => (
                      <tr key={region}>
                        <td>{region}</td>
                        <td className="num">{n}</td>
                      </tr>
                    ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
