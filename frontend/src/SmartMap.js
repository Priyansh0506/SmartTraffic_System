import React, { useState, useCallback, useEffect } from 'react';
import { LoadScript } from '@react-google-maps/api';
import GoogleMapView from './GoogleMapView';
import MapView from './MapView';

const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

// google maps is the main map, falls back to leaflet if key is
// missing or google maps fails to load (quota, invalid key etc)
const GOOGLE_LIBRARIES = ['visualization'];

function SmartMap(props) {
  const [googleFailed, setGoogleFailed] = useState(false);

  const handleLoadError = useCallback(() => {
    console.log('google maps failed, using leaflet instead');
    setGoogleFailed(true);
  }, []);

  // google maps sometimes fails silently through this global instead
  // of a normal error, so listen for it separately
  useEffect(() => {
    window.gm_authFailure = handleLoadError;
    return () => {
      delete window.gm_authFailure;
    };
  }, [handleLoadError]);

  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_KEY === 'your_google_maps_key_here') {
    return <MapView {...props} />;
  }

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
