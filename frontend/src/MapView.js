import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet.heat';

function circleColor(score) {
  if (score <= 3) return '#4ade80';
  if (score <= 6) return '#fb923c';
  return '#f87171';
}

function statusText(score) {
  if (score <= 3) return 'Clear';
  if (score <= 6) return 'Moderate';
  return 'Heavy';
}

// moves the map to the searched location
function MoveMap({ searchResult }) {
  const map = useMap();
  useEffect(() => {
    if (searchResult?.lat && searchResult?.lon) {
      map.flyTo([parseFloat(searchResult.lat), parseFloat(searchResult.lon)], 13, { duration: 1.0 });
    }
  }, [searchResult, map]);
  return null;
}

// draws the heatmap layer using search history points
function HeatmapLayer({ searchHistory }) {
  const map = useMap();
  useEffect(() => {
    if (!searchHistory || !searchHistory.length) return;

    const pts = searchHistory
      .filter(r => r.lat && r.lon)
      .map(r => [parseFloat(r.lat), parseFloat(r.lon), r.current_score / 10]);

    if (!pts.length) return;

    const layer = L.heatLayer(pts, {
      radius: 30,
      blur: 18,
      maxZoom: 17,
      max: 0.3,
      gradient: { 0.2: '#4ade80', 0.5: '#facc15', 0.7: '#fb923c', 1.0: '#f87171' }
    }).addTo(map);

    return () => map.removeLayer(layer);
  }, [searchHistory, map]);
  return null;
}

// small helper to show one prediction row inside the popup
function PredictionRow({ label, score }) {
  const color = circleColor(score);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: color }}>
        {score}/10 — {statusText(score)}
      </span>
    </div>
  );
}

// This is the fallback map (Leaflet + OpenStreetMap).
// Used when Google Maps is not available or key has expired.
// Has heatmap + circles + prediction popup (30min and 60min).
// Only thing missing vs Google version is the live road traffic layer.
function MapView({ searchResult, searchHistory = [] }) {

  return (
    <MapContainer center={[28.6, 77.2]} zoom={5} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
      />
      <MoveMap searchResult={searchResult} />
      <HeatmapLayer searchHistory={searchHistory} />

      {searchHistory.map((item, i) => {
        if (!item.lat || !item.lon) return null;

        const color = circleColor(item.current_score);
        const isActive = searchResult?.location === item.location;

        // prediction scores - fallback to current score if backend didn't send them
        const score30 = item.predict_30min ?? item.current_score;
        const score60 = item.predict_60min ?? item.current_score;

        return (
          <Circle
            key={i}
            center={[parseFloat(item.lat), parseFloat(item.lon)]}
            radius={isActive ? 1500 : 800}
            color={color}
            fillColor={color}
            fillOpacity={isActive ? 0.5 : 0.2}
            weight={isActive ? 2 : 1}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 190 }}>

                {/* location name */}
                <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#1e293b', textTransform: 'capitalize' }}>
                  📍 {item.location}
                </p>

                {/* current traffic info */}
                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>RIGHT NOW</p>
                  <p style={{ fontSize: 12, color: '#475569', marginBottom: 2 }}>Vehicles: {item.vehicle_count}</p>
                  <p style={{ fontSize: 12, color: '#475569', marginBottom: 2 }}>Weather: {item.weather}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: color }}>
                    {item.current_score}/10 — {statusText(item.current_score)}
                  </p>
                </div>

                {/* prediction section */}
                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 8px' }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>PREDICTION</p>
                  <PredictionRow label="After 30 min" score={score30} />
                  <PredictionRow label="After 60 min" score={score60} />
                  <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, borderTop: '1px solid #e2e8f0', paddingTop: 4 }}>
                    {score60 > item.current_score
                      ? '⚠️ Traffic will increase in next 1 hour'
                      : score60 < item.current_score
                      ? '✅ Traffic will ease in next 1 hour'
                      : '➡️ Traffic will remain similar'}
                  </p>
                </div>

                {/* note shown only in fallback mode */}
                <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 6, textAlign: 'center' }}>
                  Live road traffic view requires Google Maps
                </p>

              </div>
            </Popup>
          </Circle>
        );
      })}
    </MapContainer>
  );
}

export default MapView;
