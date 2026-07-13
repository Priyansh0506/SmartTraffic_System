from flask import Blueprint, jsonify, request
from model import predict_congestion, predict_accident_risk
from weather import get_weather
from vehicle_count import count_vehicles
from routes.predict import (
    pick_best_match,
    _tomtom_search,
    _nominatim_search,
    _check_override,
    _geocode_city_only,
    _google_search,
)
import datetime

accident_bp = Blueprint('accident', __name__)


@accident_bp.route('/api/accident-risk', methods=['POST'])
def accident_risk():
    data = request.get_json()
    location = data.get('location', '')
    lat = data.get('lat')
    lon = data.get('lon')
    # if the frontend already fetched these via /api/predict, reuse them
    # instead of hitting the geocoders again - cuts API usage roughly in half
    vehicle_count = data.get('vehicle_count')
    weather = data.get('weather')

    if not lat or not lon:
        override = _check_override(location)
        if override:
            lat, lon = override
        else:
            google_candidates = _google_search(location)

            tomtom_candidates = _tomtom_search(location, use_bias=True, use_idxset=True)
            if not tomtom_candidates:
                tomtom_candidates = _tomtom_search(location, use_bias=False, use_idxset=True)
            if not tomtom_candidates:
                tomtom_candidates = _tomtom_search(location, use_bias=False, use_idxset=False)

            nominatim_candidates = _nominatim_search(location)

            all_candidates = google_candidates + tomtom_candidates + nominatim_candidates
            all_candidates = [c for c in all_candidates if c.get('lat') and c.get('lon')]

            if not all_candidates:
                return jsonify({"error": "Location not found"}), 404

            best = pick_best_match(all_candidates, location)
            if best is None:
                best = _geocode_city_only(location)
            if best is None:
                return jsonify({"error": "Location not found"}), 404
            lat = best['lat']
            lon = best['lon']

    if weather is None:
        weather, wind_speed = get_weather(float(lat), float(lon))

    if vehicle_count is None:
        vehicle_count = count_vehicles(float(lat), float(lon))

    now = datetime.datetime.now()
    hour = now.hour

    congestion = predict_congestion(vehicle_count, weather, hour)
    risk = predict_accident_risk(vehicle_count, weather, hour, congestion, lat=lat, lon=lon)

    return jsonify({
        "location": location,
        "lat": lat,
        "lon": lon,
        "weather": weather,
        "vehicle_count": vehicle_count,
        "congestion_score": congestion,
        **risk
    })