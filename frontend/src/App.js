import React, { useState } from 'react';
import api from './api';
import SmartMap from './SmartMap';
import DemoSection from './DemoSection';
import './App.css';
import RouteOptimizer from './RouteOptimizer';
import EmergencyRoute from './EmergencyRoute';
import Home from './Home';
import PeakHourChart from './PeakHourChart';
import { SkeletonCard, SkeletonMap } from './SkeletonCard';

function App() {
  const [searchLocation, setSearchLocation] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [accidentRisk, setAccidentRisk] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const searchTraffic = async () => {
    if (!searchLocation.trim()) return;
    setSearching(true);
    setAccidentRisk(null);

    // Step 1: get the location + traffic data. If THIS fails, the
    // location genuinely wasn't found - show the alert.
    let predictData;
    try {
      const res = await api.post('/api/predict', {
        location: searchLocation
      });
      predictData = res.data;
    } catch (err) {
      alert('Location not found.');
      setSearching(false);
      return;
    }

    // location was found successfully - show it right away, don't let
    // a slow/failed accident-risk call block or hide this result
    const result = { location: searchLocation, ...predictData, accident_risk: null };
    setSearchResult(result);
    setSearchHistory(prev => [result, ...prev.slice(0, 9)]);
    setSearching(false);

    // Step 2: accident risk is a separate, independent call. If it
    // fails (cold start timeout etc.) we just leave the risk section
    // empty instead of throwing away the whole result with a wrong alert.
    setRiskLoading(true);
    try {
      const riskRes = await api.post('/api/accident-risk', {
        location: searchLocation,
        lat: predictData.lat,
        lon: predictData.lon,
        vehicle_count: predictData.vehicle_count,
        weather: predictData.weather
      });

      const finalResult = { ...result, accident_risk: riskRes.data };
      setSearchResult(finalResult);
      setSearchHistory(prev => [finalResult, ...prev.slice(1)]);
      setAccidentRisk(riskRes.data);
    } catch (err) {
      setAccidentRisk(null);
    } finally {
      setRiskLoading(false);
    }
  };

  const getStatus = (score) => {
    if (score <= 3) return { label: 'Clear', cls: 'status-clear', scoreCls: 'score-clear' };
    if (score <= 6) return { label: 'Moderate', cls: 'status-moderate', scoreCls: 'score-moderate' };
    return { label: 'Heavy', cls: 'status-heavy', scoreCls: 'score-heavy' };
  };

  const getRiskColor = (level) => {
    if (level === 'Low') return '#4ade80';
    if (level === 'Moderate') return '#fb923c';
    return '#f87171';
  };

  // when user clicks a history item, pull its saved risk data back too
  const selectHistoryItem = (item) => {
    setSearchResult(item);
    setAccidentRisk(item.accident_risk || null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div>
            <h1 className="app-title">Traffic Monitor</h1>
            <p className="app-subtitle">Search any location in India</p>
          </div>
          <div className="tab-row">
            <button
              className={`tab-btn ${activeTab === 'home' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('home')}
            >
              Home
            </button>
            <button
              className={`tab-btn ${activeTab === 'monitor' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('monitor')}
            >
              Live Monitor
            </button>
            <button
              className={`tab-btn ${activeTab === 'demo' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('demo')}
            >
              Demo Evaluation
            </button>
            <button
              className={`tab-btn ${activeTab === 'route' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('route')}
            >
              Route Optimizer
            </button>
            <button
              className={`tab-btn ${activeTab === 'emergency' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('emergency')}
            >
              🚨 Emergency
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'home' && (
        <Home onNavigate={(tab) => setActiveTab(tab)} />
      )}

      {activeTab === 'monitor' && (
        <main className="app-main">
          <div className="search-row">
            <input
              className="search-input"
              type="text"
              placeholder="Search a location in India..."
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchTraffic()}
            />
            <button className="search-btn" onClick={searchTraffic} disabled={searching}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="content-grid">
            <div className="result-panel">
              {searching ? (
                <SkeletonCard />
              ) : searchResult ? (
                <div className="result-card">
                  <div className="result-header">
                    <span className="result-pin">&#9679;</span>
                    <h2 className="result-location">{searchResult.location}</h2>
                  </div>

                  <span className={`result-status-badge ${getStatus(searchResult.current_score).cls}`}>
                    {getStatus(searchResult.current_score).label}
                  </span>

                  <div className="stat-rows">
                    <div className="stat-row">
                      <span className="stat-row-label">Vehicles</span>
                      <span className="stat-row-value">{searchResult.vehicle_count}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-row-label">Weather</span>
                      <span className="stat-row-value">{searchResult.weather}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-row-label">Score now</span>
                      <span className={`stat-row-value ${getStatus(searchResult.current_score).scoreCls}`}>
                        {searchResult.current_score}/10
                      </span>
                    </div>
                  </div>

                  <div className="pred-section">
                    <p className="pred-title">Predictions</p>
                    <div className="pred-row">
                      <div className="pred-item">
                        <p className="pred-label">30 min</p>
                        <p className={`pred-value ${getStatus(searchResult.prediction_30min).scoreCls}`}>
                          {searchResult.prediction_30min}/10
                        </p>
                      </div>
                      <PeakHourChart lat={searchResult.lat} lon={searchResult.lon} />
                      <div className="pred-item">
                        <p className="pred-label">60 min</p>
                        <p className={`pred-value ${getStatus(searchResult.prediction_60min).scoreCls}`}>
                          {searchResult.prediction_60min}/10
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* accident risk section */}
                  <div className="pred-section" style={{ marginTop: 16 }}>
                    <p className="pred-title">Accident Risk</p>
                    {riskLoading && (
                      <p style={{ fontSize: 12, color: '#6b7280' }}>Checking...</p>
                    )}
                    {!riskLoading && !accidentRisk && (
                      <p style={{ fontSize: 12, color: '#6b7280' }}>Risk data unavailable right now.</p>
                    )}
                    {accidentRisk && !riskLoading && (
                      <div style={{
                        background: '#111318',
                        border: `1px solid ${getRiskColor(accidentRisk.risk_level)}33`,
                        borderRadius: 8,
                        padding: '14px 16px',
                        marginTop: 8
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
                </div>
              ) : (
                <div className="empty-panel">
                  <p className="empty-title">No location selected</p>
                  <p className="empty-sub">Search a city or road above to see live traffic data.</p>
                </div>
              )}

              {searchHistory.length > 1 && (
                <div className="history-section">
                  <p className="history-label">Recent</p>
                  {searchHistory.slice(1).map((item, i) => {
                    const s = getStatus(item.current_score);
                    return (
                      <div key={i} className="history-item" onClick={() => selectHistoryItem(item)}>
                        <span className="history-location">{item.location}</span>
                        <span className={`history-badge ${s.cls}`}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="map-panel">
              {searching ? (
                <SkeletonMap />
              ) : (
                <SmartMap searchResult={searchResult} searchHistory={searchHistory} />
              )}
            </div>
          </div>
        </main>
      )}

      {activeTab === 'demo' && <DemoSection />}

      {activeTab === 'route' && <RouteOptimizer />}

      {activeTab === 'emergency' && <EmergencyRoute />}
    </div>
  );
}

export default App;