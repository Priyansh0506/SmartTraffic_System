import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SkeletonCard, SkeletonMap } from './SkeletonCard';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapReadyHandler({ bounds }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (bounds) map.fitBounds(bounds, { padding: [40, 40] });
    }, 200);
    return () => clearTimeout(timer);
  }, [map, bounds]);

  return null;
}

function RouteOptimizer() {
  const [source, setSource] = useState('');
  const [sourceCoords, setSourceCoords] = useState(null); // raw GPS coords, kept separately from the display text
  const [destination, setDestination] = useState('');
  const [result, setResult] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    detectCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setSourceCoords(`${latitude},${longitude}`);

        try {
          // this is just for a friendly label in the input box - the
          // actual route request uses the raw coordinates above, not this text
          const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: { lat: latitude, lon: longitude, format: 'json' },
          });
          const place = res.data?.display_name?.split(',').slice(0, 2).join(',') || 'Current location';
          setSource(place);
        } catch (err) {
          setSource('Current location');
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false)
    );
  };

  const getStatus = (score) => {
    if (score <= 3) return { label: 'Clear', cls: 'status-clear', scoreCls: 'score-clear' };
    if (score <= 6) return { label: 'Moderate', cls: 'status-moderate', scoreCls: 'score-moderate' };
    return { label: 'Heavy', cls: 'status-heavy', scoreCls: 'score-heavy' };
  };

  const getRouteColor = (score) => {
    if (score <= 3) return '#2ecc71';
    if (score <= 6) return '#f39c12';
    return '#e74c3c';
  };

  const findBestRoute = async () => {
    if (!source.trim() || !destination.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await axios.post('http://127.0.0.1:5000/api/optimize-route', {
        source: sourceUsedIsGPS() ? sourceCoords : source,
        destination,
      });
      setResult(res.data);
      setSelectedRouteId(res.data.all_routes[0].route_id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not find a route between these locations.');
    } finally {
      setLoading(false);
    }
  };

  // tracks whether the user edited the "From" box themselves after GPS
  // filled it in - if they typed something new, we respect their text
  const [sourceWasEdited, setSourceWasEdited] = useState(false);
  const sourceUsedIsGPS = () => sourceCoords && !sourceWasEdited;

  const selectedRoute = result
    ? result.all_routes.find((r) => r.route_id === selectedRouteId)
    : null;

  const mapBounds = result
    ? [result.source_coords, result.destination_coords, ...(selectedRoute?.coordinates || [])]
    : null;

  return (
    <div className="route-optimizer">
      <div className="search-row">
        <input
          className="search-input"
          type="text"
          placeholder={locating ? 'Detecting your location...' : 'From...'}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setSourceWasEdited(true);
          }}
        />
        <button
          className="search-btn"
          onClick={() => {
            setSourceWasEdited(false);
            detectCurrentLocation();
          }}
          disabled={locating}
          title="Use my current location"
        >
          {locating ? '...' : '📍'}
        </button>
        <input
          className="search-input"
          type="text"
          placeholder="To..."
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && findBestRoute()}
        />
        <button className="search-btn" onClick={findBestRoute} disabled={loading}>
          {loading ? 'Finding...' : 'Find Best Route'}
        </button>
      </div>

      {error && !loading && <p className="empty-sub">{error}</p>}

      {loading && (
        <div className="content-grid">
          <div className="result-panel">
            <SkeletonCard />
            <div style={{ marginTop: 14 }}>
              <SkeletonCard />
            </div>
          </div>
          <div className="map-panel">
            <SkeletonMap />
          </div>
        </div>
      )}

      {result && selectedRoute && !loading && (
        <div className="content-grid">
          <div className="result-panel">
            <p className="history-label">Top {result.all_routes.length} routes — tap one to preview</p>

            {result.all_routes.map((route) => {
              const s = getStatus(route.congestion_score);
              const isSelected = route.route_id === selectedRouteId;
              return (
                <div
                  key={route.route_id}
                  className="result-card"
                  style={{
                    cursor: 'pointer',
                    marginBottom: '10px',
                    border: isSelected ? '2px solid ' + getRouteColor(route.congestion_score) : '2px solid transparent',
                  }}
                  onClick={() => setSelectedRouteId(route.route_id)}
                >
                  <div className="result-header">
                    <span className="result-pin">&#9679;</span>
                    <h2 className="result-location">
                      {route.summary} {isSelected ? '(selected)' : ''}
                    </h2>
                  </div>

                  <span className={`result-status-badge ${s.cls}`}>{s.label}</span>

                  <div className="stat-rows">
                    <div className="stat-row">
                      <span className="stat-row-label">Distance</span>
                      <span className="stat-row-value">{route.distance_km} km</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-row-label">ETA</span>
                      <span className="stat-row-value">{route.duration_min} min</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-row-label">Congestion</span>
                      <span className={`stat-row-value ${s.scoreCls}`}>{route.congestion_score}/10</span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="pred-section">
              <p className="pred-title">Traffic ahead — {selectedRoute.summary}</p>
              {selectedRoute.segments.map((seg, i) => {
                const s = getStatus(seg.congestion_score);
                return (
                  <div key={i} className="history-item">
                    <span className="history-location">{seg.distance_km} km in</span>
                    <span className={`history-badge ${s.cls}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="map-panel">
            <MapContainer
              center={result.source_coords}
              zoom={12}
              style={{ height: '500px', width: '100%', borderRadius: '12px' }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapReadyHandler bounds={mapBounds} />

              <Marker position={result.source_coords}>
                <Popup>Start: {source}</Popup>
              </Marker>
              <Marker position={result.destination_coords}>
                <Popup>End: {destination}</Popup>
              </Marker>

              {result.all_routes.map((route) => (
                <Polyline
                  key={route.route_id}
                  positions={route.coordinates}
                  pathOptions={{
                    color: getRouteColor(route.congestion_score),
                    weight: route.route_id === selectedRouteId ? 6 : 3,
                    opacity: route.route_id === selectedRouteId ? 1 : 0.35,
                  }}
                  eventHandlers={{
                    click: () => setSelectedRouteId(route.route_id),
                  }}
                />
              ))}
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export default RouteOptimizer;