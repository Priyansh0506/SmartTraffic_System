import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function circleColor(score) {
  if (score <= 3) return '#4ade80';
  if (score <= 6) return '#fb923c';
  return '#f87171';
}

function statusText(score) {
  if (score <= 3) return 'Clear traffic';
  if (score <= 6) return 'Moderate traffic';
  return 'Heavy traffic';
}

function getRadius(item, isActive) {
  if (item.place_type === 'city') {
    return isActive ? 9000 : 6000;
  }
  return isActive ? 1500 : 800;
}

function getFillOpacity(item, isActive) {
  if (item.place_type === 'city') {
    return isActive ? 0.15 : 0.07;
  }
  return isActive ? 0.5 : 0.2;
}

function getWeight(item, isActive) {
  if (item.place_type === 'city') return 1;
  return isActive ? 2 : 1;
}

// pans/zooms map to the searched location
function MoveMap({ searchResult }) {
  const map = useMap();
  useEffect(() => {
    if (searchResult?.lat && searchResult?.lon) {
      const zoom = searchResult.place_type === 'city' ? 11 : 13;
      map.flyTo([parseFloat(searchResult.lat), parseFloat(searchResult.lon)], zoom, { duration: 1.0 });
    }
  }, [searchResult, map]);
  return null;
}

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

// fallback map (Leaflet + OSM), used when Google Maps key is missing/fails
// has heatmap + circles + 30min/60min prediction popup
// only missing thing vs Google version is live traffic layer
function MapView({ searchResult, searchHistory = [] }) {
  // leaflet doesn't respect zIndex reliably, so draw order decides
  // what's on top -> cities first, landmarks after
  const sortedHistory = [...searchHistory].sort((a, b) => {
    const aCity = a.place_type === 'city' ? -1 : 1;
    const bCity = b.place_type === 'city' ? -1 : 1;
    return aCity - bCity;
  });

  return (
    <MapContainer center={[28.6, 77.2]} zoom={5} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
      />
      <MoveMap searchResult={searchResult} />

      {sortedHistory.map((item, i) => {
        if (!item.lat || !item.lon) return null;

        const color = circleColor(item.current_score);
        const isActive = searchResult?.location === item.location;

        const score30 = item.predict_30min ?? item.current_score;
        const score60 = item.predict_60min ?? item.current_score;

        return (
          <Circle
            key={item.location + i}
            center={[parseFloat(item.lat), parseFloat(item.lon)]}
            radius={getRadius(item, isActive)}
            color={color}
            fillColor={color}
            fillOpacity={getFillOpacity(item, isActive)}
            weight={getWeight(item, isActive)}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 190 }}>

                <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#1e293b', textTransform: 'capitalize' }}>
                  📍 {item.location}
                </p>

                <div style={{ background: '#f8fafc', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>RIGHT NOW</p>
                  <p style={{ fontSize: 12, color: '#475569', marginBottom: 2 }}>Vehicles: {item.vehicle_count}</p>
                  <p style={{ fontSize: 12, color: '#475569', marginBottom: 2 }}>Weather: {item.weather}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: color }}>
                    {item.current_score}/10 — {statusText(item.current_score)}
                  </p>
                </div>

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