import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, Circle, InfoWindow, TrafficLayer } from '@react-google-maps/api';

const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 28.6, lng: 77.2 };
// keep this outside component, otherwise map re-applies options every render
const mapOptions = { streetViewControl: false, mapTypeControl: false };

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

// city circle = bigger radius, landmark = small (point-level)
function getRadius(item, isActive) {
  if (item.place_type === 'city') {
    return isActive ? 9000 : 6000;
  }
  return isActive ? 180 : 100;
}

// city fill kept light so landmark circle stays visible on top
function getFillOpacity(item, isActive) {
  if (item.place_type === 'city') {
    return isActive ? 0.18 : 0.08;
  }
  return isActive ? 0.45 : 0.15;
}

function getStrokeWeight(item, isActive) {
  if (item.place_type === 'city') return 1;
  return isActive ? 2.5 : 1.5;
}

function getZoomForResult(result) {
  if (!result) return 16;
  return result.place_type === 'city' ? 11 : 16;
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

function GoogleMapView({ searchResult, searchHistory = [], onMapError }) {
  const [activeMarker, setActiveMarker] = useState(null);
  const mapRef = useRef(null);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(5);
  const tilesLoadedRef = useRef(false);
  const tilesTimeoutRef = useRef(null);

  const panToResult = useCallback((result) => {
  if (!result || !result.lat || !result.lon) return;

  const newCenter = {
    lat: Number(result.lat),
    lng: Number(result.lon),
  };

  setMapCenter(newCenter);
  setMapZoom(getZoomForResult(result));

  if (mapRef.current) {
    mapRef.current.panTo(newCenter);
    mapRef.current.setZoom(getZoomForResult(result));
  }
}, []);

  const onLoad = useCallback((map) => {
    mapRef.current = map;
    panToResult(searchResult);

    if (tilesTimeoutRef.current) {
      clearTimeout(tilesTimeoutRef.current);
    }

    tilesLoadedRef.current = false;
    tilesTimeoutRef.current = window.setTimeout(() => {
      if (!tilesLoadedRef.current && onMapError) {
        onMapError(new Error('google-tiles-failed'));
      }
    }, 4500);
  }, [searchResult, panToResult, onMapError]);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  useEffect(() => {
    panToResult(searchResult);
  }, [searchResult, panToResult]);

  // draw cities first, landmarks last -> landmarks stay on top
  const sortedHistory = [...searchHistory].sort((a, b) => {
    const aCity = a.place_type === 'city' ? -1 : 1;
    const bCity = b.place_type === 'city' ? -1 : 1;
    return aCity - bCity;
  });

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={mapCenter}
      zoom={mapZoom}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={mapOptions}
      onTilesLoaded={() => {
        tilesLoadedRef.current = true;
        if (tilesTimeoutRef.current) {
          clearTimeout(tilesTimeoutRef.current);
          tilesTimeoutRef.current = null;
        }
      }}
    >
      {/* TrafficLayer can sometimes throw if the Maps JS has partial errors
          (quota/limit messages). Guard it so runtime errors are avoided. */}
      {typeof window !== 'undefined' && window.google && window.google.maps && (
        <TrafficLayer />
      )}
      <></>

      {sortedHistory.map((item, i) => {
        if (!item.lat || !item.lon) return null;

        const color = circleColor(item.current_score);
        const isActive = searchResult && searchResult.location === item.location;
        const position = {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon)
        };

        const score30 = item.predict_30min ?? item.current_score;
        const score60 = item.predict_60min ?? item.current_score;
        const isCity = item.place_type === 'city';

        return (
          <React.Fragment key={item.location + i}>
            <Circle
              center={position}
              radius={getRadius(item, isActive)}
              options={{
                strokeColor: color,
                fillColor: color,
                fillOpacity: getFillOpacity(item, isActive),
                strokeWeight: getStrokeWeight(item, isActive),
                clickable: true,
                zIndex: isCity ? 1 : 10
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

export default React.memo(GoogleMapView);