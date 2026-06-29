from flask import Blueprint, jsonify, request
from model import predict_congestion
from weather import get_weather
from vehicle_count import count_vehicles
import datetime
import requests

predict_bp = Blueprint('predict', __name__)

TOMTOM_API_KEY = "jH5ES6h0SgbDwRBUqrVRqM89aD8LGRNw"

@predict_bp.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json()
    location = data.get('location', '')
    lat = data.get('lat', None)
    lon = data.get('lon', None)

    # search location via TomTom
    if not lat or not lon:
        search_url = f"https://api.tomtom.com/search/2/search/{location}.json?key={TOMTOM_API_KEY}&countrySet=IN&limit=1"
        search_response = requests.get(search_url)
        search_data = search_response.json()

        if search_data['results']:
            lat = search_data['results'][0]['position']['lat']
            lon = search_data['results'][0]['position']['lon']
        else:
            return jsonify({"error": "Location not found"}), 404

    # get weather for that specific location
    weather, wind_speed = get_weather(float(lat), float(lon))

    vehicle_count = count_vehicles(float(lat), float(lon))
    hour = datetime.datetime.now().hour

    score_now = predict_congestion(vehicle_count, weather, hour)
    score_30 = predict_congestion(vehicle_count + 10, weather, hour + 1)
    score_60 = predict_congestion(vehicle_count + 20, weather, hour + 2)

    return jsonify({
        "location": location,
        "lat": lat,
        "lon": lon,
        "weather": weather,
        "vehicle_count": vehicle_count,
        "current_score": score_now,
        "prediction_30min": score_30,
        "prediction_60min": score_60
    })