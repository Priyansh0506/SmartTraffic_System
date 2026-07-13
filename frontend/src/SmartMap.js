import React, { useState, useCallback, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import GoogleMapView from './GoogleMapView';
import MapView from './MapView';
import ErrorBoundary from './ErrorBoundary';

const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;
const GOOGLE_LIBRARIES = ['visualization'];

function SmartMap(props) {
    const [googleFailed, setGoogleFailed] = useState(false);
  const [mapPreference, setMapPreference] = useState('google');
  const [activeMap, setActiveMap] = useState('leaflet');
  const [isSwitching, setIsSwitching] = useState(false);

  const handleLoadError = useCallback(() => {
    setGoogleFailed(true);
    setActiveMap('leaflet');
    setMapPreference('leaflet');
    try {
      window.localStorage.setItem('map_preference', 'leaflet');
    } catch (e) {}
  }, []);

  useEffect(() => {
    window.gm_authFailure = handleLoadError;

    const handleGlobalError = (event) => {
      const message = event?.message || '';
      if (typeof message === 'string' && /Maps Demo Key limit reached|Google Maps JavaScript API error|Google Maps API error|Quota|daily quota/i.test(message)) {
        handleLoadError();
      }
    };

    window.addEventListener('error', handleGlobalError, true);
    return () => {
      delete window.gm_authFailure;
      window.removeEventListener('error', handleGlobalError, true);
    };
  }, [handleLoadError]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_KEY || '',
    libraries: GOOGLE_LIBRARIES,
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('map_preference');
      if (stored === 'leaflet' || stored === 'google') {
        setMapPreference(stored);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (loadError) handleLoadError();
  }, [loadError, handleLoadError]);

  // when Google Maps is available, try to show it; otherwise show Leaflet.
  // render both layers and crossfade between them so switching is smooth.
  const showGoogle = !googleFailed && mapPreference === 'google' && isLoaded && GOOGLE_MAPS_KEY && GOOGLE_MAPS_KEY !== 'your_google_maps_key_here';

  useEffect(() => {
    // smooth transition: set switching flag, then switch after a short delay
    const target = showGoogle ? 'google' : 'leaflet';
    if (target === activeMap) return;
    setIsSwitching(true);
    const t = setTimeout(() => {
      setActiveMap(target);
      setIsSwitching(false);
      // persist last-good map choice when google is healthy
      if (target === 'google') localStorage.setItem('map_preference', 'google');
      if (target === 'leaflet') localStorage.setItem('map_preference', 'leaflet');
    }, 260);
    return () => clearTimeout(t);
  }, [showGoogle, activeMap]);

  const mapContainerStyle = {
    position: 'relative',
    height: '100%',
    width: '100%',
  };

  const layerStyle = (visible) => ({
    position: 'absolute',
    inset: 0,
    transition: 'opacity 300ms ease',
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? 'auto' : 'none',
    willChange: 'opacity',
  });

  return (
    <div style={mapContainerStyle}>
      {isSwitching && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: '#111317', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.6)' }}>
            <div className="spinner" style={{ width: 28, height: 28, border: '3px solid #2b2f36', borderTop: '3px solid #60a5fa', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
          </div>
        </div>
      )}
      <div style={layerStyle(activeMap === 'leaflet')}>
        <MapView {...props} />
      </div>

      <div style={layerStyle(activeMap === 'google')}>
        {showGoogle ? (
          <ErrorBoundary fallback={<MapView {...props} />} onError={handleLoadError}>
            <GoogleMapView {...props} onMapError={handleLoadError} />
          </ErrorBoundary>
        ) : null}
      </div>
    </div>
  );
}

export default SmartMap;