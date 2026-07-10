from flask import Blueprint, jsonify, request
from model import get_peak_hour_profile
from weather import get_weather
from vehicle_count import count_vehicles
import datetime

peak_bp = Blueprint('peak', __name__)


@peak_bp.route('/api/peak-hours', methods=['POST'])
def peak_hours():
    data = request.get_json()
    lat = data.get('lat')
    lon = data.get('lon')

    if not lat or not lon:
        return jsonify({"error": "lat and lon are required"}), 400

    weather, wind_speed = get_weather(float(lat), float(lon))
    vehicle_count = count_vehicles(float(lat), float(lon))
    now = datetime.datetime.now()
    current_hour = now.hour
    is_weekend = now.weekday() >= 5  # Sat=5, Sun=6

    # deterministic per-location seed - same coordinates always get the
    # same wobble, different places get different peak timing
    location_seed = round(float(lat) * 1000) + round(float(lon) * 1000)

    profile = get_peak_hour_profile(
        vehicle_count, weather, current_hour,
        is_weekend=is_weekend, location_seed=location_seed
    )

    return jsonify({
        "weather": weather,
        "current_hour": current_hour,
        "profile": profile
    })