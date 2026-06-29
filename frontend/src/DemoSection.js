import React, { useState, useRef } from 'react';
import axios from 'axios';

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

function DemoSection() {
  const [file, setFile] = useState(null);
  const [videoURL, setVideoURL] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

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
      const res = await axios.post('http://127.0.0.1:5000/api/demo/analyze', formData, {
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
            </div>
          )}

          {/* video info */}
          <div style={{
            background: '#1a1d24', border: '1px solid #1f2128', borderRadius: 8,
            padding: '20px 24px'
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
        </>
      )}
    </div>
  );
}

export default DemoSection;