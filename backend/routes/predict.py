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

TYPE_RANK = {
    "Geography": 2,
    "Point Address": 1,
    "Street": 1,
}


def _normalize_tomtom(r):
    """Converts a raw TomTom result into our common candidate format."""
    return {
        "source": "tomtom",
        "lat": r.get("position", {}).get("lat"),
        "lon": r.get("position", {}).get("lon"),
        "name": (r.get("poi", {}).get("name") or ""),
        "address": (r.get("address", {}).get("freeformAddress") or ""),
        "municipality": (r.get("address", {}).get("municipality") or ""),
        "type_rank": TYPE_RANK.get(r.get("type"), 0),
        "geo_rank": GEO_PRIORITY.get(r.get("entityType"), 0),
        "score": r.get("score", 0),
    }


def _normalize_nominatim(r):
    """Converts a raw Nominatim (OpenStreetMap) result into our common candidate format."""
    addr = r.get("address", {})
    municipality = (
        addr.get("town") or addr.get("city") or addr.get("village")
        or addr.get("municipality") or addr.get("county") or ""
    )
    place_type = r.get("type", "")
    place_class = r.get("class", "")

    # OSM's "importance" plays the same role as TomTom's "score"
    importance = float(r.get("importance", 0) or 0)

    # give a geo_rank bonus similar to TomTom's Municipality bonus when
    # OSM itself classifies this as an actual place (not a road/POI)
    geo_rank = 0
    if place_class == "place" and place_type in ("city", "town", "village", "hamlet"):
        geo_rank = 4
    elif place_class == "boundary":
        geo_rank = 3

    type_rank = 0 if place_class in ("highway",) else 1

    return {
        "source": "nominatim",
        "lat": float(r.get("lat")) if r.get("lat") else None,
        "lon": float(r.get("lon")) if r.get("lon") else None,
        "name": r.get("name", ""),
        "address": r.get("display_name", ""),
        "municipality": municipality,
        "type_rank": type_rank,
        "geo_rank": geo_rank,
        # scale importance (0-1 range) up so it's comparable to TomTom's score (0-10ish range)
        "score": importance * 10,
    }


def _tomtom_search(location, use_bias=True, use_idxset=True):
    params = f"?key={TOMTOM_API_KEY}&countrySet=IN&limit=10"
    if use_idxset:
        params += "&idxSet=Geo,PAD"
    if use_bias:
        params += "&lat=29.9&lon=78.0&radius=200000"

    url = f"https://api.tomtom.com/search/2/search/{location}.json{params}"
    try:
        response = requests.get(url, timeout=5)
        data = response.json()
        results = data.get('results', [])
    except Exception as e:
        print(f"[debug] TomTom search failed: {e}")
        results = []

    print(f"[debug] tomtom url={url} result_count={len(results)}")
    return [_normalize_tomtom(r) for r in results]


def _nominatim_search(location):
    """
    Free OSM-based geocoder. Its India coverage for small towns/villages
    is often better than TomTom's, so we merge both sources and let
    pick_best_match choose the best candidate across all of them.
    """
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": location,
        "format": "jsonv2",
        "addressdetails": 1,
        "countrycodes": "in",
        "limit": 10,
    }
    headers = {
        # Nominatim's usage policy requires a real identifying User-Agent
        "User-Agent": "SmartTrafficSystem/1.0 (contact: your-email@example.com)"
    }
    try:
        response = requests.get(url, params=params, headers=headers, timeout=5)
        results = response.json() if response.status_code == 200 else []
    except Exception as e:
        print(f"[debug] Nominatim search failed: {e}")
        results = []

    print(f"[debug] nominatim result_count={len(results)}")
    return [_normalize_nominatim(r) for r in results]


def pick_best_match(candidates, query):
    query_words = [w for w in query.lower().split() if len(w) > 2]

    def combined_text(c):
        return f"{c['name']} {c['address']}".lower()

    def word_hits_for(c):
        text = combined_text(c)
        return sum(1 for w in query_words if w in text)

    def all_words_match(c):
        text = combined_text(c)
        return all(w in text for w in query_words)

    # Tier 1: candidates where EVERY query word appears somewhere
    full_match = [c for c in candidates if all_words_match(c)]
    # Tier 2: candidates with at least one word match
    partial_match = [c for c in candidates if word_hits_for(c) > 0]

    pool = full_match if full_match else (partial_match if partial_match else candidates)

    def overlap_score(c):
        municipality = (c.get('municipality') or '').lower()
        municipality_match = 1 if municipality and all(
            w in municipality for w in query_words
        ) else 0

        word_hits = word_hits_for(c)
        return (municipality_match, word_hits, c['type_rank'], c['geo_rank'], c['score'])

    ranked = sorted(pool, key=overlap_score, reverse=True)
    return ranked[0]


@predict_bp.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json()
    location = data.get('location', '')
    lat = data.get('lat', None)
    lon = data.get('lon', None)

    if not lat or not lon:
        # query both geocoders and merge their results into one candidate pool
        tomtom_candidates = _tomtom_search(location, use_bias=True, use_idxset=True)
        if not tomtom_candidates:
            tomtom_candidates = _tomtom_search(location, use_bias=False, use_idxset=True)
        if not tomtom_candidates:
            tomtom_candidates = _tomtom_search(location, use_bias=False, use_idxset=False)

        nominatim_candidates = _nominatim_search(location)

        all_candidates = tomtom_candidates + nominatim_candidates
        # drop anything without valid coordinates
        all_candidates = [c for c in all_candidates if c.get('lat') and c.get('lon')]

        if not all_candidates:
            return jsonify({"error": "Location not found"}), 404

        best = pick_best_match(all_candidates, location)
        print(f"[predict] query='{location}' picked source={best['source']} -> '{best['name'] or best['address']}'")

        lat = best['lat']
        lon = best['lon']

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