import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from './api';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import LocationAutocomplete from './LocationAutocomplete';
import { SkeletonCard, SkeletonMap } from './SkeletonCard';

const EMERGENCY_STATE_KEY = 'smarttraffic_emergency_route_state';

// same trick as the route optimizer map - leaflet needs a nudge after
// mount or it renders with the wrong size half the time
function MapReadyHandler({ bounds }) {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize();
      if (bounds) map.fitBounds(bounds, { padding: [40, 40] });
    }, 200);
    return () => clearTimeout(t);
  }, [map, bounds]);

  return null;
}

function EmergencyRoute() {
  const [vehicleType, setVehicleType] = useState('ambulance');
  const [source, setSource] = useState('');
  const [sourceCoords, setSourceCoords] = useState(null);
  const [sourceEdited, setSourceEdited] = useState(false);
  const [destination, setDestination] = useState('');
  // destination dropdown se select ki gayi "lat,lon" string yahan store
  // hoti hai - iski wajah se backend ko destination naam se dobara
  // geocode guess nahi karna padta
  const [destCoords, setDestCoords] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const json = window.localStorage.getItem(EMERGENCY_STATE_KEY);
      if (json) {
        const saved = JSON.parse(json);
        if (saved?.vehicleType) setVehicleType(saved.vehicleType);
        if (saved?.source) setSource(saved.source);
        if (saved?.sourceCoords) setSourceCoords(saved.sourceCoords);
        if (saved?.sourceEdited !== undefined) setSourceEdited(saved.sourceEdited);
        if (saved?.destination) setDestination(saved.destination);
        if (saved?.destCoords) setDestCoords(saved.destCoords);
        if (saved?.result) setResult(saved.result);
        if (saved?.error) setError(saved.error);
      }
    } catch (e) {
      // ignore invalid storage state
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        EMERGENCY_STATE_KEY,
        JSON.stringify({
          vehicleType,
          source,
          sourceCoords,
          sourceEdited,
          destination,
          destCoords,
          result,
          error,
        })
      );
    } catch (e) {
      // ignore storage write errors
    }
  }, [vehicleType, source, sourceCoords, sourceEdited, destination, destCoords, result, error]);

  function getLocation() {
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setSourceCoords(lat + ',' + lon);

        try {
          const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: { lat, lon, format: 'json' },
          });
          const place = res.data?.display_name?.split(',').slice(0, 2).join(',');
          setSource(place || 'Current location');
        } catch (e) {
          setSource('Current location');
        }
        setLocating(false);
      },
      () => setLocating(false)
    );
  }

  async function findRoute() {
    if (!source.trim() || !destination.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    const usingGPS = sourceCoords && !sourceEdited;

    try {
      const res = await api.post('/api/emergency-route', {
        source: usingGPS ? sourceCoords : source,
        destination: destCoords || destination,
        vehicle_type: vehicleType,
      });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not find a route between these locations.');
    }
    setLoading(false);
  }

  const bounds = result ? [result.source_coords, result.destination_coords, ...result.coordinates] : null;

  return (
    <div className="route-optimizer">
      <div className="search-row">
        <button
          className={'tab-btn ' + (vehicleType === 'ambulance' ? 'tab-active' : '')}
          onClick={() => setVehicleType('ambulance')}
        >
          🚑 Ambulance
        </button>
        <button
          className={'tab-btn ' + (vehicleType === 'fire' ? 'tab-active' : '')}
          onClick={() => setVehicleType('fire')}
        >
          🚒 Fire Brigade
        </button>
      </div>

      <div className="search-row">
        <LocationAutocomplete
          className="search-input"
          placeholder={locating ? 'Detecting your location...' : 'From...'}
          value={source}
          onChangeText={(text) => {
            setSource(text);
            setSourceEdited(true);
          }}
          onSelectSuggestion={(s) => {
            setSourceCoords(`${s.lat},${s.lon}`);
            setSourceEdited(false);
          }}
          onEnter={findRoute}
        />
        <button
          className="search-btn"
          onClick={() => {
            setSourceEdited(false);
            getLocation();
          }}
          disabled={locating}
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
          onEnter={findRoute}
        />
        <button className="search-btn" onClick={findRoute} disabled={loading}>
          {loading ? 'Clearing route...' : 'Dispatch'}
        </button>
      </div>

      {error && !loading && <p className="empty-sub">{error}</p>}

      {loading && (
        <div className="content-grid">
          <div className="result-panel">
            <SkeletonCard />
          </div>
          <div className="map-panel">
            <SkeletonMap />
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="content-grid">
          <div className="result-panel">
            <div className="result-card" style={{ border: '2px solid #e74c3c' }}>
              <div className="result-header">
                <span className="result-pin">🚨</span>
                <h2 className="result-location">
                  {vehicleType === 'ambulance' ? 'Ambulance' : 'Fire Brigade'} Route
                </h2>
              </div>

              <span className="result-status-badge status-clear">Corridor Cleared</span>

              <div className="stat-rows">
                <div className="stat-row">
                  <span className="stat-row-label">Distance</span>
                  <span className="stat-row-value">{result.distance_km} km</span>
                </div>
                <div className="stat-row">
                  <span className="stat-row-label">ETA (cleared)</span>
                  <span className="stat-row-value score-clear">{result.duration_min} min</span>
                </div>
                <div className="stat-row">
                  <span className="stat-row-label">Normal ETA</span>
                  <span className="stat-row-value">{result.normal_duration_min} min</span>
                </div>
                <div className="stat-row">
                  <span className="stat-row-label">Time saved</span>
                  <span className="stat-row-value score-clear">{result.time_saved_min} min</span>
                </div>
              </div>
            </div>

            <div className="pred-section">
              <p className="pred-title">Route ahead</p>
              {result.segments.map((seg, i) => (
                <div key={i} className="history-item">
                  <span className="history-location">{seg.distance_km} km in</span>
                  <span className="history-badge status-clear">Cleared</span>
                </div>
              ))}
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

              <MapReadyHandler bounds={bounds} />

              <Marker position={result.source_coords}>
                <Popup>Dispatch point: {source}</Popup>
              </Marker>
              <Marker position={result.destination_coords}>
                <Popup>Destination: {destination}</Popup>
              </Marker>

              <Polyline
                positions={result.coordinates}
                pathOptions={{ color: '#e74c3c', weight: 7, opacity: 0.9, dashArray: '14, 10' }}
              />
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmergencyRoute;