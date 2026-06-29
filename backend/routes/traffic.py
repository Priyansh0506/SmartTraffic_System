from flask import Blueprint, jsonify
from database import get_connection
from vehicle_count import count_vehicles
from weather import get_weather
from model import predict_congestion
import datetime

traffic_bp = Blueprint('traffic', __name__)

LOCATIONS = {
    "Haridwar Main Road": {"lat": 29.9457, "lon": 78.1642},
    "Rishikesh Road": {"lat": 30.0869, "lon": 78.2676},
    "Delhi Highway NH58": {"lat": 28.9845, "lon": 77.7064},
    "Dehradun Road": {"lat": 30.3165, "lon": 78.0322},
    "Society Road Laksar": {"lat": 29.7383, "lon": 78.0314},
    "Ranipur Chowraha Haridwar": {"lat": 29.9639, "lon": 78.1480},
}

@traffic_bp.route('/api/traffic/live', methods=['GET'])
def live_traffic():
    results = []
    weather, wind_speed = get_weather()
    hour = datetime.datetime.now().hour

    for location_name, coords in LOCATIONS.items():
        vehicle_count = count_vehicles(coords['lat'], coords['lon'])
        congestion_score = predict_congestion(vehicle_count, weather, hour)

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO traffic_data (location, vehicle_count, weather, congestion_score) VALUES (%s, %s, %s, %s)",
            (location_name, vehicle_count, weather, congestion_score)
        )
        conn.commit()
        conn.close()

        results.append({
            "location": location_name,
            "vehicle_count": vehicle_count,
            "weather": weather,
            "congestion_score": congestion_score,
            "hour": hour
        })

    return jsonify(results)

@traffic_bp.route('/api/traffic/history', methods=['GET'])
def traffic_history():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM traffic_data ORDER BY timestamp DESC LIMIT 20")
    data = cursor.fetchall()
    conn.close()
    return jsonify(data)