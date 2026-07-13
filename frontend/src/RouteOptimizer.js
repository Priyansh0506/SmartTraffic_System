import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import api from './api';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import LocationAutocomplete from './LocationAutocomplete';
import { SkeletonCard, SkeletonMap } from './SkeletonCard';

const ROUTE_STATE_KEY = 'smarttraffic_route_optimizer_state';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapReadyHandler({ bounds }) {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;

    // container size isn't final yet right when this mounts (skeleton
    // -> real layout swap still settling) - a flat setTimeout(200) used
    // to fire before that finished on slower renders and fitBounds would
    // zoom against the wrong size. waiting a couple frames lets it paint first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        map.invalidateSize();
        if (bounds) map.fitBounds(bounds, { padding: [40, 40] });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [map, bounds]);

  return null;
}

function RouteOptimizer() {
  const [source, setSource] = useState('');
  const [sourceCoords, setSourceCoords] = useState(null); // raw GPS coords, kept separately from the display text
  const [destination, setDestination] = useState('');
  // agar destination dropdown se select hui hai to uske lat/lon "lat,lon"
  // string ke form mein yahan store hote hain, taaki backend ko dobara
  // geocoding guess na karni pade aur "location not found" error na aaye
  const [destCoords, setDestCoords] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(true);
  const [error, setError] = useState('');
  const [sourceWasEdited, setSourceWasEdited] = useState(false);

  useEffect(() => {
    let loaded = false;
    try {
      const json = window.localStorage.getItem(ROUTE_STATE_KEY);
      if (json) {
        const saved = JSON.parse(json);
        if (saved?.source) setSource(saved.source);
        if (saved?.sourceCoords) setSourceCoords(saved.sourceCoords);
        if (saved?.destination) setDestination(saved.destination);
        if (saved?.destCoords) setDestCoords(saved.destCoords);
        if (saved?.result) setResult(saved.result);
        if (saved?.selectedRouteId) setSelectedRouteId(saved.selectedRouteId);
        if (saved?.sourceWasEdited !== undefined) setSourceWasEdited(saved.sourceWasEdited);
        if (saved?.error) setError(saved.error);
        loaded = true;
      }
    } catch (e) {
      // ignore invalid storage state
    }

    if (!loaded) {
      detectCurrentLocation();
    } else {
      setLocating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ROUTE_STATE_KEY,
        JSON.stringify({
          source,
          sourceCoords,
          destination,
          destCoords,
          result,
          selectedRouteId,
          sourceWasEdited,
          error,
        })
      );
    } catch (e) {
      // ignore storage errors
    }
  }, [source, sourceCoords, destination, destCoords, result, selectedRouteId, sourceWasEdited, error]);

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
    if (score <= 3) return { label: 'Clear traffic', cls: 'status-clear', scoreCls: 'score-clear' };
    if (score <= 6) return { label: 'Moderate traffic', cls: 'status-moderate', scoreCls: 'score-moderate' };
    return { label: 'Heavy traffic', cls: 'status-heavy', scoreCls: 'score-heavy' };
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
      const res = await api.post('/api/optimize-route', {
        source: sourceUsedIsGPS() ? sourceCoords : source,
        destination: destCoords || destination,
      });
      setResult(res.data);
      setSelectedRouteId(res.data.all_routes[0].route_id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not find a route between these locations.');
    } finally {
      setLoading(false);
    }
  };

  const sourceUsedIsGPS = () => sourceCoords && !sourceWasEdited;

  const selectedRoute = result ? result.all_routes.find((r) => r.route_id === selectedRouteId) : null;

  // without this, the array below gets rebuilt on every render (even
  // unrelated ones), which kept re-firing MapReadyHandler's effect and
  // was the actual cause of the random zoom glitches
  const mapBounds = useMemo(() => {
    if (!result) return null;
    return [result.source_coords, result.destination_coords, ...(selectedRoute?.coordinates || [])];
  }, [result, selectedRoute]);

  return (
    <div className="route-optimizer">
      <div className="search-row">
        <LocationAutocomplete
          className="search-input"
          placeholder={locating ? 'Detecting your location...' : 'From...'}
          value={source}
          onChangeText={(text) => {
            setSource(text);
            setSourceWasEdited(true);
          }}
          onSelectSuggestion={(s) => {
            setSourceCoords(`${s.lat},${s.lon}`);
            setSourceWasEdited(false);
          }}
          onEnter={findBestRoute}
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
        <LocationAutocomplete
          className="search-input"
          placeholder="To..."
          value={destination}
          onChangeText={(text) => {
            setDestination(text);
            setDestCoords(null); // free type kiya, purana selection clear
          }}
          onSelectSuggestion={(s) => setDestCoords(`${s.lat},${s.lon}`)}
          onEnter={findBestRoute}
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