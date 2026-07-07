from flask import Blueprint, jsonify, request
from model import predict_congestion, predict_accident_risk
from weather import get_weather
from vehicle_count import count_vehicles
from routes.predict import pick_best_match, TOMTOM_API_KEY
import datetime
import requests

accident_bp = Blueprint('accident', __name__)


@accident_bp.route('/api/accident-risk', methods=['POST'])
def accident_risk():
    data = request.get_json()
    location = data.get('location', '')
    lat = data.get('lat')
    lon = data.get('lon')

    if lat is None or lon is None:
        url = f"https://api.tomtom.com/search/2/search/{location}.json?key={TOMTOM_API_KEY}&countrySet=IN&limit=5"
        res = requests.get(url, timeout=5)
        res_data = res.json()

        results = res_data.get('results', [])
        if not results:
            return jsonify({"error": "Location not found"}), 404

        best = pick_best_match(results, location)
        lat = best['position']['lat']
        lon = best['position']['lon']

    weather, wind_speed = get_weather(float(lat), float(lon))
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