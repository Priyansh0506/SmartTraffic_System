import React, { useState, useRef } from 'react';
import api from './api';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import PeakHourChart from './PeakHourChart';

function ResultRing({ value, label, color }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const fill = (value / 100) * circ;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={72} height={72} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke="#1f2128" strokeWidth={5} />
        <circle
          cx={36} cy={36} r={r} fill="none"
          stroke={color} strokeWidth={5}
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
        />
        <text
          x={36} y={40} textAnchor="middle"
          fill={color} fontSize={13} fontWeight={700}
          style={{ transform: 'rotate(90deg)', transformOrigin: '36px 36px' }}
        >
          {value}
        </text>
      </svg>
      <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
    </div>
  );
}

// leaflet sizes itself wrong unless we nudge it after the container
// is actually visible on screen
function MapReadyHandler({ bounds }) {
  const map = useMap();

  React.useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize();
      if (bounds) map.fitBounds(bounds, { padding: [40, 40] });
    }, 200);
    return () => clearTimeout(t);
  }, [map, bounds]);

  return null;
}

function getRiskColor(level) {
  if (level === 'Low') return '#4ade80';
  if (level === 'Moderate') return '#fb923c';
  return '#f87171';
}

function DemoSection() {
  const [file, setFile] = useState(null);
  const [videoURL, setVideoURL] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  // route mapping state - this part takes the video's vehicle count
  // and puts it on an actual road
  const [routeSource, setRouteSource] = useState('');
  const [routeDestination, setRouteDestination] = useState('');
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [vehicleType, setVehicleType] = useState('ambulance');
  const [routeResult, setRouteResult] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');

  // accident risk for the source point of the route, fetched right
  // after a route is drawn (needs real lat/lon, which the video alone
  // doesn't have)
  const [accidentRisk, setAccidentRisk] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('video/')) {
      setError('Only video files are supported.');
      return;
    }
    setFile(f);
    setVideoURL(URL.createObjectURL(f));
    setError('');
    setResult(null);
    setRouteResult(null);
    setAccidentRisk(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!file) { setError('Upload a video first.'); return; }
    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const res = await api.post('/api/demo/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Check if backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const v = result ? result.video_analysis : null;

  async function runRoute() {
    if (!routeSource.trim() || !routeDestination.trim()) {
      setRouteError('Enter both a start and destination.');
      return;
    }

    setRouteLoading(true);
    setRouteError('');
    setRouteResult(null);
    setAccidentRisk(null);

    try {
      const res = await api.post('/api/demo/route', {
        source: routeSource,
        destination: routeDestination,
        vehicle_count: v.vehicle_count,
        emergency: emergencyMode,
        vehicle_type: vehicleType
      });
      setRouteResult(res.data);

      // now that we have real coordinates for the source point,
      // fetch accident risk for it too — skip this in emergency mode,
      // risk isn't relevant while dispatching
      if (!emergencyMode && res.data.source_coords) {
        setRiskLoading(true);
        try {
          const riskRes = await api.post('/api/accident-risk', {
            location: routeSource,
            lat: res.data.source_coords[0],
            lon: res.data.source_coords[1]
          });
          setAccidentRisk(riskRes.data);
        } catch (riskErr) {
          setAccidentRisk(null);
        } finally {
          setRiskLoading(false);
        }
      }
    } catch (err) {
      setRouteError(err.response?.data?.error || 'Could not generate a route.');
    }
    setRouteLoading(false);
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 28px', fontFamily: 'Inter, Segoe UI, sans-serif' }}>

      {/* video preview + upload zone */}
      {videoURL && (
        <div style={{
          marginBottom: 16, borderRadius: 8, overflow: 'hidden',
          border: '1px solid #1f2128', background: '#000'
        }}>
          <video src={videoURL} controls style={{ width: '100%', maxHeight: 300, display: 'block' }} />
        </div>
      )}

      {/* upload + run row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 20, alignItems: 'stretch' }}>
        <div
          onClick={() => fileRef.current.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          style={{
            background: dragOver ? '#1f2128' : '#1a1d24',
            border: `1px dashed ${file ? '#4ade80' : '#2a2d36'}`,
            borderRadius: 8, padding: '16px 20px',
            cursor: 'pointer', transition: 'all 0.15s'
          }}
        >
          <input
            ref={fileRef} type="file" accept="video/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {file ? (
            <div>
              <p style={{ fontSize: 13, color: '#4ade80', fontWeight: 500 }}>{file.name}</p>
              <p style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>
                {(file.size / (1024 * 1024)).toFixed(1)} MB · click to change
              </p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: '#6b7280' }}>Drop any traffic video here or click to upload</p>
              <p style={{ fontSize: 11, color: '#374151', marginTop: 3 }}>MP4, AVI, MOV · no location needed</p>
            </div>
          )}
        </div>

        <button
          onClick={analyze}
          disabled={loading || !file}
          style={{
            background: '#1a1d24',
            color: loading || !file ? '#4b5563' : '#d1d5db',
            border: '1px solid #2a2d36',
            padding: '0 24px', borderRadius: 8,
            fontSize: 14, fontWeight: 500,
            cursor: loading || !file ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap', transition: 'all 0.15s'
          }}
        >
          {loading ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      {loading && (
        <p style={{ fontSize: 12, color: '#4b5563', marginBottom: 16 }}>
          Processing video frames — may take 30–60 seconds depending on length
        </p>
      )}

      {error && (
        <p style={{ fontSize: 13, color: '#f87171', marginBottom: 16 }}>{error}</p>
      )}

      {v && (
        <>
          {/* result cards - pure video analysis, no API comparison */}
          <div style={{
            background: '#1a1d24', border: '1px solid #1f2128', borderRadius: 8,
            padding: '20px 24px', marginBottom: 16
          }}>
            <p style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
              Video Analysis Result
            </p>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <ResultRing value={v.vehicle_count} label="Vehicles" color="#60a5fa" />
              <ResultRing value={v.congestion_score} label="Congestion /10" color={v.congestion_score >= 6 ? '#f87171' : v.congestion_score >= 3 ? '#fb923c' : '#4ade80'} />
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 28 }}>
              <div>
                <p style={{ fontSize: 11, color: '#6b7280' }}>Weather detected</p>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb', marginTop: 2 }}>{v.weather}</p>
              </div>
            </div>
          </div>

          {/* 30 min / 60 min short term prediction */}
          {result.short_term_forecast && (
            <div style={{
              background: '#1a1d24', border: '1px solid #1f2128', borderRadius: 8,
              padding: '20px 24px', marginBottom: 16
            }}>
              <p style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
                Short-Term Prediction
              </p>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { key: 'in_30_min', label: 'In 30 min' },
                  { key: 'in_60_min', label: 'In 60 min' }
                ].map(({ key, label }) => {
                  const f = result.short_term_forecast[key];
                  const c = f.projected_congestion;
                  const color = c >= 6 ? '#f87171' : c >= 3 ? '#fb923c' : '#4ade80';
                  return (
                    <div key={key} style={{
                      flex: 1, background: '#111318', border: `1px solid ${color}33`,
                      borderRadius: 8, padding: '16px 18px'
                    }}>
                      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{label}</p>
                      <p style={{ fontSize: 24, fontWeight: 700, color }}>{c}<span style={{ fontSize: 13, color: '#4b5563' }}>/10</span></p>
                      <p style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>~{f.projected_vehicles} vehicles</p>
                    </div>
                  );
                })}
              </div>

              {/* full 24hr curve, built off this same video's numbers -
                  collapsed by default so it doesn't fight for attention
                  with the 30/60 min cards above */}
              {result.peak_hour_profile && (
                <PeakHourChart data={result.peak_hour_profile} />
              )}
            </div>
          )}

          {/* video info */}
          <div style={{
            background: '#1a1d24', border: '1px solid #1f2128', borderRadius: 8,
            padding: '20px 24px', marginBottom: 16
          }}>
            <p style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
              Video Info
            </p>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, color: '#6b7280' }}>Duration</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', marginTop: 2 }}>{v.duration_sec}s</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#6b7280' }}>Frames analyzed</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', marginTop: 2 }}>{v.frames_analyzed}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#6b7280' }}>Avg brightness</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', marginTop: 2 }}>{v.brightness}</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#6b7280' }}>Blur score</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#e5e7eb', marginTop: 2 }}>{v.blur_score}</p>
              </div>
            </div>
          </div>

          {/* take the vehicle count from this video and put it on a real route */}
          <div style={{
            background: '#1a1d24', border: '1px solid #1f2128', borderRadius: 8,
            padding: '20px 24px'
          }}>
            <p style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
              Map This Traffic Onto A Route
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="From..."
                value={routeSource}
                onChange={(e) => setRouteSource(e.target.value)}
                style={{
                  flex: 1, minWidth: 140, background: '#111318', border: '1px solid #2a2d36',
                  borderRadius: 6, padding: '10px 12px', color: '#e5e7eb', fontSize: 13
                }}
              />
              <input
                type="text"
                placeholder="To..."
                value={routeDestination}
                onChange={(e) => setRouteDestination(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runRoute(); }}
                style={{
                  flex: 1, minWidth: 140, background: '#111318', border: '1px solid #2a2d36',
                  borderRadius: 6, padding: '10px 12px', color: '#e5e7eb', fontSize: 13
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#9ca3af', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={emergencyMode}
                  onChange={(e) => setEmergencyMode(e.target.checked)}
                />
                Emergency mode — clear the route ahead
              </label>

              {emergencyMode && (
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  style={{ background: '#111318', border: '1px solid #2a2d36', borderRadius: 6, padding: '8px 10px', color: '#e5e7eb', fontSize: 13 }}
                >
                  <option value="ambulance">Ambulance</option>
                  <option value="fire">Fire Brigade</option>
                </select>
              )}

              <button
                onClick={runRoute}
                disabled={routeLoading}
                style={{
                  background: emergencyMode ? '#7f1d1d' : '#1a1d24',
                  color: '#e5e7eb', border: '1px solid #2a2d36',
                  padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                  cursor: routeLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {routeLoading ? 'Routing...' : emergencyMode ? 'Dispatch' : 'Show Route'}
              </button>
            </div>

            {routeError && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{routeError}</p>}

            {routeResult && (
              <>
                <div style={{ display: 'flex', gap: 28, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>Distance</p>
                    <p style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb', marginTop: 2 }}>{routeResult.distance_km} km</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>{routeResult.emergency ? 'ETA (cleared)' : 'ETA'}</p>
                    <p style={{ fontSize: 16, fontWeight: 600, color: '#4ade80', marginTop: 2 }}>{routeResult.duration_min} min</p>
                  </div>
                  {routeResult.emergency ? (
                    <>
                      <div>
                        <p style={{ fontSize: 11, color: '#6b7280' }}>Normal ETA</p>
                        <p style={{ fontSize: 16, fontWeight: 600, color: '#e5e7eb', marginTop: 2 }}>{routeResult.normal_duration_min} min</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: '#6b7280' }}>Time saved</p>
                        <p style={{ fontSize: 16, fontWeight: 600, color: '#4ade80', marginTop: 2 }}>{routeResult.time_saved_min} min</p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p style={{ fontSize: 11, color: '#6b7280' }}>Congestion (from video)</p>
                      <p style={{
                        fontSize: 16, fontWeight: 600, marginTop: 2,
                        color: routeResult.congestion_score >= 6 ? '#f87171' : routeResult.congestion_score >= 3 ? '#fb923c' : '#4ade80'
                      }}>
                        {routeResult.congestion_score}/10
                      </p>
                    </div>
                  )}
                </div>

              {/* accident risk for the source point - skipped for emergency
                    dispatch since it's not relevant while clearing a route */}
                {!routeResult.emergency && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                      Accident Risk at {routeSource}
                    </p>
                    {riskLoading && (
                      <p style={{ fontSize: 12, color: '#6b7280' }}>Checking...</p>
                    )}
                    {accidentRisk && !riskLoading && (
                      <div style={{
                        background: '#111318',
                        border: `1px solid ${getRiskColor(accidentRisk.risk_level)}33`,
                        borderRadius: 8,
                        padding: '14px 16px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: getRiskColor(accidentRisk.risk_level) }}>
                            {accidentRisk.risk_level} Risk
                          </span>
                          <span style={{ fontSize: 18, fontWeight: 700, color: getRiskColor(accidentRisk.risk_level) }}>
                            {accidentRisk.risk_score}/10
                          </span>
                        </div>
                        <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, color: '#9ca3af' }}>
                          {accidentRisk.factors.map((f, i) => (
                            <li key={i} style={{ marginBottom: 4 }}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #1f2128' }}>
                  <MapContainer center={routeResult.source_coords} zoom={12} style={{ height: 360, width: '100%' }}>
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapReadyHandler bounds={[routeResult.source_coords, routeResult.destination_coords, ...routeResult.coordinates]} />

                    <Marker position={routeResult.source_coords}>
                      <Popup>{routeSource}</Popup>
                    </Marker>
                    <Marker position={routeResult.destination_coords}>
                      <Popup>{routeDestination}</Popup>
                    </Marker>

                    <Polyline
                      positions={routeResult.coordinates}
                      pathOptions={
                        routeResult.emergency
                          ? { color: '#e74c3c', weight: 6, opacity: 0.9, dashArray: '14, 10' }
                          : {
                              color: routeResult.congestion_score >= 6 ? '#f87171' : routeResult.congestion_score >= 3 ? '#fb923c' : '#4ade80',
                              weight: 5, opacity: 0.85
                            }
                      }
                    />
                  </MapContainer>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default DemoSection;