import os
from flask import Blueprint, jsonify, request
from model import predict_congestion, predict_short_term
from weather import get_weather
from vehicle_count import count_vehicles
from dotenv import load_dotenv
import datetime
import requests

load_dotenv()

predict_bp = Blueprint('predict', __name__)

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY")


GEO_PRIORITY = {
    "Municipality": 4,
    "MunicipalitySubdivision": 3,
    "Neighbourhood": 3,
    "CountrySecondarySubdivision": 1,
}


def pick_best_match(results, query):
    query_words = [w for w in query.lower().split() if len(w) > 2]

    # rank by result "type": actual places first, then street/colony
    # addresses, POIs (restaurants, dhabas etc.) come last
    TYPE_RANK = {
        "Geography": 2,
        "Point Address": 1,
        "Street": 1,
    }

    def overlap_score(r):
        name = (r.get('poi', {}).get('name') or '').lower()
        address = (r.get('address', {}).get('freeformAddress') or '').lower()
        combined = f"{name} {address}"
        word_hits = sum(1 for w in query_words if w in combined)
        # prefer actual towns/colonies/streets over POIs/dhabas that just
        # happen to mention the place name in their address
        type_rank = TYPE_RANK.get(r.get('type'), 0)
        geo_rank = GEO_PRIORITY.get(r.get('entityType'), 0)
        return (type_rank, geo_rank, word_hits, r.get('score', 0))

    ranked = sorted(results, key=overlap_score, reverse=True)
    return ranked[0]


@predict_bp.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json()
    location = data.get('location', '')
    lat = data.get('lat', None)
    lon = data.get('lon', None)

    if not lat or not lon:
        search_url = (
            f"https://api.tomtom.com/search/2/search/{location}.json"
            f"?key={TOMTOM_API_KEY}&countrySet=IN&limit=5&idxSet=Geo,PAD"
        )
        search_response = requests.get(search_url, timeout=5)
        search_data = search_response.json()

        results = search_data.get('results', [])

        # idxSet=Geo,PAD sometimes misses very small towns - if nothing came
        # back, retry once with the full index (POIs included) so we still
        # find *something* rather than a flat 404
        if not results:
            fallback_url = (
                f"https://api.tomtom.com/search/2/search/{location}.json"
                f"?key={TOMTOM_API_KEY}&countrySet=IN&limit=5"
            )
            fallback_response = requests.get(fallback_url, timeout=5)
            results = fallback_response.json().get('results', [])

        if not results:
            return jsonify({"error": "Location not found"}), 404

        best = pick_best_match(results, location)
        print(f"[predict] query='{location}' picked='{best.get('poi', {}).get('name') or best.get('address', {}).get('freeformAddress')}'")

        lat = best['position']['lat']
        lon = best['position']['lon']

    weather, wind_speed = get_weather(float(lat), float(lon))

    vehicle_count = count_vehicles(float(lat), float(lon))
    now = datetime.datetime.now()
    hour = now.hour

    score_now = predict_congestion(vehicle_count, weather, hour)

    short_term = predict_short_term(vehicle_count, weather, hour, now.minute)
    score_30 = short_term["in_30_min"]["projected_congestion"]
    score_60 = short_term["in_60_min"]["projected_congestion"]

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