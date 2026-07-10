import React, { useState, useCallback, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import GoogleMapView from './GoogleMapView';
import MapView from './MapView';

const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;
const GOOGLE_LIBRARIES = ['visualization'];

function SmartMap(props) {
  const [googleFailed, setGoogleFailed] = useState(false);

  const handleLoadError = useCallback(() => {
    setGoogleFailed(true);
  }, []);

  useEffect(() => {
    window.gm_authFailure = handleLoadError;
    return () => {
      delete window.gm_authFailure;
    };
  }, [handleLoadError]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_KEY || '',
    libraries: GOOGLE_LIBRARIES,
  });

  useEffect(() => {
    if (loadError) handleLoadError();
  }, [loadError, handleLoadError]);

  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_KEY === 'your_google_maps_key_here') {
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