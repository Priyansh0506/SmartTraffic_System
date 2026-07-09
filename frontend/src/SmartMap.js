import React, { useState, useCallback, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import GoogleMapView from './GoogleMapView';
import MapView from './MapView';

const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

// google maps is the main map, falls back to leaflet if key is
// missing or google maps fails to load (quota, invalid key etc)
const GOOGLE_LIBRARIES = ['visualization'];

// useJsApiLoader keeps a single shared script instance across the app,
// so it survives React.StrictMode's double-mount in dev without the
// "google api is already presented" / "already defined" errors that
// <LoadScript> throws when it gets mounted twice.
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

  const hasKey = GOOGLE_MAPS_KEY && GOOGLE_MAPS_KEY !== 'your_google_maps_key_here';

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: hasKey ? GOOGLE_MAPS_KEY : '',
    libraries: GOOGLE_LIBRARIES,
  });

  if (!hasKey) {
    return <MapView {...props} />;
  }

  if (googleFailed || loadError) {
    return <MapView {...props} />;
  }

  if (!isLoaded) {
    return <div style={{ height: '100%', width: '100%', background: '#1a1d24' }} />;
  }

  return <GoogleMapView {...props} />;
}

export default SmartMap;