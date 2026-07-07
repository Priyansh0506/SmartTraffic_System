import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, Circle, InfoWindow, TrafficLayer } from '@react-google-maps/api';

const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 28.6, lng: 77.2 };

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

function PredictionRow({ label, score }) {
  const color = circleColor(score);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: color }}>
        {score}/10 — {statusText(score)}
      </span>
    </div>
  );
}

// shows google's live traffic layer plus our own prediction circles
// on top, click a circle to see current + 30/60 min prediction
function GoogleMapView({ searchResult, searchHistory = [] }) {
  const [activeMarker, setActiveMarker] = useState(null);
  const mapRef = useRef(null);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (searchResult && searchResult.lat && searchResult.lon && mapRef.current) {
      mapRef.current.panTo({
        lat: parseFloat(searchResult.lat),
        lng: parseFloat(searchResult.lon)
      });
      mapRef.current.setZoom(14);
    }
  }, [searchResult]);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={5}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={{ streetViewControl: false, mapTypeControl: false }}
    >
      <TrafficLayer />

      {searchHistory.map((item, i) => {
        if (!item.lat || !item.lon) return null;

        const color = circleColor(item.current_score);
        const isActive = searchResult && searchResult.location === item.location;
        const position = {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon)
        };

        const score30 = item.prediction_30min ?? item.current_score;
        const score60 = item.prediction_60min ?? item.current_score;

        return (
          <React.Fragment key={i}>
            <Circle
              center={position}
              radius={isActive ? 1200 : 700}
              options={{
                strokeColor: color,
                fillColor: color,
                fillOpacity: isActive ? 0.45 : 0.15,
                strokeWeight: isActive ? 2.5 : 1.5,
                clickable: true
              }}
              onClick={() => setActiveMarker(i)}
            />

            {activeMarker === i && (
              <InfoWindow
                position={position}
                onCloseClick={() => setActiveMarker(null)}
              >
                <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 190, padding: 2 }}>

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

                </div>
              </InfoWindow>
            )}
          </React.Fragment>
        );
      })}
    </GoogleMap>
  );
}

export default GoogleMapView;
