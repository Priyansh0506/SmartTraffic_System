import React, { useEffect, useState } from 'react';
import api from './api';

function barColor(score, isCurrent) {
  if (isCurrent) return '#60a5fa';
  if (score <= 3) return '#4ade80';
  if (score <= 6) return '#fb923c';
  return '#f87171';
}

function formatHour(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

// 24-hour congestion bar chart, hidden behind a toggle button so it
// doesn't clutter the result card by default.
//
// Two ways to feed it data:
//   1) pass lat + lon  -> it calls /api/peak-hours itself (Live Monitor)
//   2) pass data directly, shape { weather, current_hour, profile }
//      -> no API call, used when the caller already has the numbers
//         (Demo Evaluation, from the uploaded video's own analysis)
function PeakHourChart({ lat, lon, data }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(data || null);
  const [loading, setLoading] = useState(false);
  const [hoveredHour, setHoveredHour] = useState(null);

  useEffect(() => {
    if (data) {
      setProfile(data);
      return;
    }
    if (!open || !lat || !lon) return;

    let cancelled = false;
    setLoading(true);

    api.post('/api/peak-hours', { lat, lon })
      .then(res => {
        if (!cancelled) setProfile(res.data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, lat, lon, data]);

  // in fetch-mode there's nothing to show until we have a location
  if (!data && (!lat || !lon)) return null;

  const peakHours = profile
    ? profile.profile.filter(p => p.is_peak).map(p => formatHour(p.hour))
    : [];

  const hovered = profile && hoveredHour !== null
    ? profile.profile.find(p => p.hour === hoveredHour)
    : null;

  return (
    // isolate() + width:100% + border-box stop this block from ever
    // depending on / overlapping whatever flex/grid context the parent
    // card is using - it always reserves its own full-width space
    <div
      style={{
        marginTop: 18,
        width: '100%',
        boxSizing: 'border-box',
        isolation: 'isolate',
        position: 'relative'
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: '#1a1d24',
          border: '1px solid #1f2128',
          borderRadius: open ? '10px 10px 0 0' : 10,
          padding: '12px 18px',
          color: '#e5e7eb',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
          gap: 12,
          minWidth: 0,
          boxSizing: 'border-box'
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>Peak Hour Analysis</span>
        <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 400, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {open ? 'Hide \u25B2' : 'Show \u25BC'}
        </span>
      </button>

      {open && (
        <div
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#1a1d24',
            border: '1px solid #1f2128',
            borderTop: 'none',
            borderRadius: '0 0 10px 10px',
            padding: '18px 18px 20px',
            position: 'relative'
          }}
        >
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, minHeight: 16 }}>
            {loading
              ? 'Loading 24-hour pattern...'
              : peakHours.length
                ? `Busiest around ${peakHours.join(', ')}`
                : 'Typical congestion by hour, based on current conditions'}
          </p>

          {profile && (
            <>
              {/* fixed-height reserved tooltip row above the bars so
                  hovering never pushes/overlaps anything below it */}
              <div style={{ height: 20, marginBottom: 4 }}>
                {hovered && (
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
                    {formatHour(hovered.hour)} — {hovered.congestion_score}/10
                    {hovered.is_peak ? ' (peak)' : ''}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90, width: '100%' }}>
                {profile.profile.map((p) => (
                  <div
                    key={p.hour}
                    onMouseEnter={() => setHoveredHour(p.hour)}
                    onMouseLeave={() => setHoveredHour(null)}
                    style={{
                      flex: '1 1 0%',
                      minWidth: 0,
                      height: '100%',
                      display: 'flex',
                      alignItems: 'flex-end',
                      position: 'relative',
                      cursor: 'pointer'
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${Math.max((p.congestion_score / 10) * 100, 4)}%`,
                        background: barColor(p.congestion_score, p.is_current),
                        borderRadius: '2px 2px 0 0',
                        opacity: hoveredHour === null || hoveredHour === p.hour ? 1 : 0.4,
                        outline: p.is_peak ? '1px solid #fbbf24' : 'none',
                        transition: 'opacity 0.15s'
                      }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: '#4b5563' }}>12AM</span>
                <span style={{ fontSize: 10, color: '#4b5563' }}>6AM</span>
                <span style={{ fontSize: 10, color: '#4b5563' }}>12PM</span>
                <span style={{ fontSize: 10, color: '#4b5563' }}>6PM</span>
                <span style={{ fontSize: 10, color: '#4b5563' }}>11PM</span>
              </div>

              <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#6b7280', display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#60a5fa', marginRight: 4 }} />
                  Now
                </span>
                <span style={{ fontSize: 11, color: '#6b7280', display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, border: '1px solid #fbbf24', marginRight: 4 }} />
                  Peak hour
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default PeakHourChart;