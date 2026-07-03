import React, { useState, useCallback, useEffect } from 'react';
import { LoadScript } from '@react-google-maps/api';
import GoogleMapView from './GoogleMapView';
import MapView from './MapView';

// key comes from .env file, not hardcoded in code
const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

// This component decides which map to show.
// Google Maps is the main map. But if the key is missing, or google
// maps fails to load (quota over, invalid key etc), we just switch
// to the old Leaflet map so the app does not break.
// heatmap needs google's "visualization" library, loaded separately
const GOOGLE_LIBRARIES = ['visualization'];

function SmartMap(props) {
  const [googleFailed, setGoogleFailed] = useState(false);

  const handleLoadError = useCallback(() => {
    console.log('google maps failed, using leaflet instead');
    setGoogleFailed(true);
  }, []);

  // google maps sometimes fails silently and calls this global
  // function instead of throwing a normal error, so we need to
  // listen for it separately
  useEffect(() => {
    window.gm_authFailure = handleLoadError;
    return () => {
      delete window.gm_authFailure;
    };
  }, [handleLoadError]);

  // no key set up yet -> don't even try google maps
  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_KEY === 'your_google_maps_key_here') {
    return <MapView {...props} />;
  }

  // google maps already failed once -> use leaflet
  if (googleFailed) {
    return <MapView {...props} />;
  }

  return (
    <LoadScript
      googleMapsApiKey={GOOGLE_MAPS_KEY}
      libraries={GOOGLE_LIBRARIES}
      onError={handleLoadError}
      loadingElement={<div style={{ height: '100%', width: '100%', background: '#1a1d24' }} />}
    >
      <GoogleMapView {...props} />
    </LoadScript>
  );
}

export default SmartMap;
