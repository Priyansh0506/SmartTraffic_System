import React, { useState } from 'react';
import axios from 'axios';
import MapView from './MapView';
import DemoSection from './DemoSection';
import './App.css';

function App() {
  const [searchLocation, setSearchLocation] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('monitor'); // 'monitor' | 'demo'

  const searchTraffic = async () => {
    if (!searchLocation.trim()) return;
    setSearching(true);
    try {
      const res = await axios.post('http://127.0.0.1:5000/api/predict', {
        location: searchLocation
      });
      const result = { location: searchLocation, ...res.data };
      setSearchResult(result);
      setSearchHistory(prev => [result, ...prev.slice(0, 9)]);
    } catch (err) {
      alert('Location not found.');
    } finally {
      setSearching(false);
    }
  };

  const getStatus = (score) => {
    if (score <= 3) return { label: 'Clear', cls: 'status-clear', scoreCls: 'score-clear' };
    if (score <= 6) return { label: 'Moderate', cls: 'status-moderate', scoreCls: 'score-moderate' };
    return { label: 'Heavy', cls: 'status-heavy', scoreCls: 'score-heavy' };
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
          </div>
        </div>
      </header>

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
              {searchResult ? (
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
                      <div className="pred-item">
                        <p className="pred-label">60 min</p>
                        <p className={`pred-value ${getStatus(searchResult.prediction_60min).scoreCls}`}>
                          {searchResult.prediction_60min}/10
                        </p>
                      </div>
                    </div>
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
                      <div key={i} className="history-item" onClick={() => setSearchResult(item)}>
                        <span className="history-location">{item.location}</span>
                        <span className={`history-badge ${s.cls}`}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="map-panel">
              <MapView searchResult={searchResult} searchHistory={searchHistory} />
            </div>
          </div>
        </main>
      )}

      {activeTab === 'demo' && <DemoSection />}
    </div>
  );
}

export default App;