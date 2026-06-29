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

function MoveMap({ searchResult }) {
  const map = useMap();
  useEffect(() => {
    if (searchResult?.lat && searchResult?.lon) {
      map.flyTo([parseFloat(searchResult.lat), parseFloat(searchResult.lon)], 13, { duration: 1.0 });
    }
  }, [searchResult, map]);
  return null;
}

function HeatmapLayer({ searchHistory }) {
  const map = useMap();
  useEffect(() => {
    if (!searchHistory || !searchHistory.length) return;

    const pts = searchHistory
      .filter(r => r.lat && r.lon)
      .map(r => [parseFloat(r.lat), parseFloat(r.lon), r.current_score / 10]);

    if (!pts.length) return;

    const layer = L.heatLayer(pts, {
      radius: 30, blur: 18, maxZoom: 17, max: 0.3,
      gradient: { 0.2: '#4ade80', 0.5: '#facc15', 0.7: '#fb923c', 1.0: '#f87171' }
    }).addTo(map);

    return () => map.removeLayer(layer);
  }, [searchHistory, map]);
  return null;
}

function MapView({ searchResult, searchHistory = [] }) {
  const popupStyle = { fontFamily: 'Inter, sans-serif', minWidth: 160 };
  const labelStyle = { fontSize: 12, color: '#64748b', marginBottom: 2 };
  const titleStyle = { fontWeight: 600, marginBottom: 6, color: '#1e293b', textTransform: 'capitalize' };

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
              <div style={popupStyle}>
                <p style={titleStyle}>{item.location}</p>
                <p style={labelStyle}>Vehicles: {item.vehicle_count}</p>
                <p style={labelStyle}>Weather: {item.weather}</p>
                <p style={labelStyle}>Score: {item.current_score}/10</p>
                <p style={{ fontSize: 12, fontWeight: 600, color }}>{statusText(item.current_score)}</p>
              </div>
            </Popup>
          </Circle>
        );
      })}
    </MapContainer>
  );
}

export default MapView;