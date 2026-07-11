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

# rank by result "type": actual places first, then street/colony
# addresses, POIs (restaurants, dhabas etc.) come last
TYPE_RANK = {
    "Geography": 2,
    "Point Address": 1,
    "Street": 1,
}


def pick_best_match(results, query):
    query_words = [w for w in query.lower().split() if len(w) > 2]

    def word_hits_for(r):
        name = (r.get('poi', {}).get('name') or '').lower()
        address = (r.get('address', {}).get('freeformAddress') or '').lower()
        combined = f"{name} {address}"
        return sum(1 for w in query_words if w in combined)

    def all_words_match(r):
        name = (r.get('poi', {}).get('name') or '').lower()
        address = (r.get('address', {}).get('freeformAddress') or '').lower()
        combined = f"{name} {address}"
        return all(w in combined for w in query_words)

    # Tier 1: results where EVERY query word appears somewhere
    full_match = [r for r in results if all_words_match(r)]
    # Tier 2: results with at least one word match
    partial_match = [r for r in results if word_hits_for(r) > 0]

    candidates = full_match if full_match else (partial_match if partial_match else results)

    def overlap_score(r):
        name = (r.get('poi', {}).get('name') or '').lower()
        address = (r.get('address', {}).get('freeformAddress') or '').lower()
        municipality = (r.get('address', {}).get('municipality') or '').lower()
        combined = f"{name} {address}"

        municipality_match = 1 if municipality and all(
            w in municipality for w in query_words
        ) else 0

        word_hits = word_hits_for(r)
        type_rank = TYPE_RANK.get(r.get('type'), 0)
        geo_rank = GEO_PRIORITY.get(r.get('entityType'), 0)

        return (municipality_match, word_hits, type_rank, geo_rank, r.get('score', 0))

    ranked = sorted(candidates, key=overlap_score, reverse=True)
    return ranked[0]


def _tomtom_search(location, use_bias=True, use_idxset=True):
    """Runs one TomTom fuzzy search call. Returns the 'results' list (possibly empty)."""
    params = f"?key={TOMTOM_API_KEY}&countrySet=IN&limit=10"
    if use_idxset:
        params += "&idxSet=Geo,PAD"
    if use_bias:
        params += "&lat=29.9&lon=78.0&radius=200000"

    url = f"https://api.tomtom.com/search/2/search/{location}.json{params}"
    response = requests.get(url, timeout=5)
    data = response.json()
    results = data.get('results', [])

    print(f"[debug] url={url} status={response.status_code} result_count={len(results)}")
    for r in results:
        print(
            f"[debug]   type={r.get('type')} entityType={r.get('entityType')} "
            f"municipality={r.get('address', {}).get('municipality')} "
            f"name={r.get('poi', {}).get('name')} "
            f"addr={r.get('address', {}).get('freeformAddress')} "
            f"score={r.get('score')}"
        )

    return results


@predict_bp.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json()
    location = data.get('location', '')
    lat = data.get('lat', None)
    lon = data.get('lon', None)

    if not lat or not lon:
        # attempt 1: biased + restricted to Geo/PAD (most accurate when it works)
        results = _tomtom_search(location, use_bias=True, use_idxset=True)

        # attempt 2: drop the bias/radius in case that's over-restricting
        if not results:
            results = _tomtom_search(location, use_bias=False, use_idxset=True)

        # attempt 3: drop idxSet too, full index (POIs included) as last resort
        if not results:
            results = _tomtom_search(location, use_bias=False, use_idxset=False)

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