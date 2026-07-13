import os
import re
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
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

LOCATION_OVERRIDES = {
    "sdm chowk roorkee": (29.8640, 77.8886),
    "civil line roorkee": (29.8640, 77.8886),
    "civil lines roorkee": (29.8640, 77.8886),
}


def _check_override(location):
    words = [w for w in re.sub(r'\s+', ' ', location.strip().lower()).split() if w]
    if not words:
        return None
    for key, coords in LOCATION_OVERRIDES.items():
        key_words = key.split()
        if all(w in words for w in key_words):
            return coords
    return None

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

# these sets decide city vs landmark for each geocoder's own type system
GOOGLE_CITY_TYPES = {
    "locality", "administrative_area_level_1", "administrative_area_level_2",
    "administrative_area_level_3", "sublocality", "postal_town"
}
GOOGLE_LANDMARK_TYPES = {
    "point_of_interest", "establishment", "premise", "route", "street_address"
}

TOMTOM_CITY_ENTITY_TYPES = {
    "Municipality", "MunicipalitySubdivision", "CountrySecondarySubdivision", "Neighbourhood"
}

NOMINATIM_CITY_PLACE_TYPES = {"city", "town", "village", "hamlet"}


def _classify_google(types):
    # check landmark first - a POI can still carry "political" in its types
    if any(t in GOOGLE_LANDMARK_TYPES for t in types):
        return "landmark"
    if any(t in GOOGLE_CITY_TYPES for t in types):
        return "city"
    return "landmark"


def _classify_tomtom(result_type, entity_type):
    if result_type == "POI":
        return "landmark"
    if entity_type in TOMTOM_CITY_ENTITY_TYPES:
        return "city"
    return "landmark"


def _classify_nominatim(place_class, place_type):
    if place_class == "place" and place_type in NOMINATIM_CITY_PLACE_TYPES:
        return "city"
    if place_class == "boundary":
        return "city"
    return "landmark"


def _normalize_tomtom(r):
    """Converts a raw TomTom result into our common candidate format."""
    result_type = r.get("type")
    entity_type = r.get("entityType")
    return {
        "source": "tomtom",
        "lat": r.get("position", {}).get("lat"),
        "lon": r.get("position", {}).get("lon"),
        "name": (r.get("poi", {}).get("name") or ""),
        "address": (r.get("address", {}).get("freeformAddress") or ""),
        "municipality": (r.get("address", {}).get("municipality") or ""),
        "type_rank": TYPE_RANK.get(result_type, 0),
        "geo_rank": GEO_PRIORITY.get(entity_type, 0),
        "score": r.get("score", 0),
        "place_type": _classify_tomtom(result_type, entity_type),
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

    importance = float(r.get("importance", 0) or 0)

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
        "score": importance * 10,
        "place_type": _classify_nominatim(place_class, place_type),
    }


def _normalize_google(r):
    """Converts a raw Google Geocoding API result into our common candidate format."""
    location = r.get("geometry", {}).get("location", {})
    municipality = ""
    for comp in r.get("address_components", []):
        types = comp.get("types", [])
        if "locality" in types or "administrative_area_level_3" in types or "sublocality" in types:
            municipality = comp.get("long_name", "")
            break

    types = r.get("types", [])
    type_rank = 2 if ("point_of_interest" in types or "establishment" in types) else 1

    return {
        "source": "google",
        "lat": location.get("lat"),
        "lon": location.get("lng"),
        "name": (r.get("formatted_address", "").split(",")[0]),
        "address": r.get("formatted_address", ""),
        "municipality": municipality,
        "type_rank": type_rank,
        "geo_rank": 5,
        "score": 20,
        "place_type": _classify_google(types),
    }


def _google_search(location):
    if not GOOGLE_API_KEY:
        return []
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": location, "region": "in", "key": GOOGLE_API_KEY}
    try:
        response = requests.get(url, params=params, timeout=5)
        data = response.json()
        status = data.get("status")
        if status != "OK":
            print(f"[debug] Google geocode status={status} for '{location}'")
            return []
        results = data.get("results", [])
    except Exception as e:
        print(f"[debug] Google geocode failed: {e}")
        results = []

    print(f"[debug] google result_count={len(results)}")
    return [_normalize_google(r) for r in results]


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
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": location,
        "format": "jsonv2",
        "addressdetails": 1,
        "countrycodes": "in",
        "limit": 10,
    }
    headers = {
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

    anchor = query_words[-1] if query_words else None

    def anchor_match(c):
        if not anchor:
            return False
        municipality = (c.get('municipality') or '').lower()
        address = (c.get('address') or '').lower()
        return anchor in municipality or anchor in address

    base_pool = [c for c in candidates if anchor_match(c)]
    if not base_pool:
        return None

    full_match = [c for c in base_pool if all_words_match(c)]
    partial_match = [c for c in base_pool if word_hits_for(c) > 0]

    pool = full_match if full_match else (partial_match if partial_match else base_pool)

    def overlap_score(c):
        municipality = (c.get('municipality') or '').lower()
        municipality_match = 1 if municipality and all(
            w in municipality for w in query_words
        ) else 0

        word_hits = word_hits_for(c)
        return (municipality_match, word_hits, c['type_rank'], c['geo_rank'], c['score'])

    ranked = sorted(pool, key=overlap_score, reverse=True)
    return ranked[0]


def _geocode_city_only(location):
    words = [w for w in location.lower().split() if len(w) > 2]
    if not words:
        return None
    anchor = words[-1]

    candidates = _google_search(anchor)
    if not candidates:
        candidates = _tomtom_search(anchor, use_bias=True, use_idxset=True)
    if not candidates:
        candidates = _nominatim_search(anchor)
    candidates = [c for c in candidates if c.get('lat') and c.get('lon')]
    if not candidates:
        return None

    best = candidates[0]
    # this path only ever geocodes a bare city/town name, so force it
    # regardless of what the geocoder itself classified it as
    best["place_type"] = "city"
    return best


def _resolve_location(location):
    override = _check_override(location)
    if override:
        lat, lon = override
        print(f"[predict] query='{location}' matched OVERRIDE -> {lat},{lon}")
        return {
            "lat": lat, "lon": lon, "source": "override",
            "name": location, "address": location, "place_type": "landmark"
        }

    google_candidates = _google_search(location)
    if google_candidates:
        best = google_candidates[0]
        print(f"[predict] query='{location}' picked source=google -> '{best['name'] or best['address']}'")
        return best

    tomtom_candidates = _tomtom_search(location, use_bias=True, use_idxset=True)
    if not tomtom_candidates:
        tomtom_candidates = _tomtom_search(location, use_bias=False, use_idxset=True)
    if not tomtom_candidates:
        tomtom_candidates = _tomtom_search(location, use_bias=False, use_idxset=False)

    nominatim_candidates = _nominatim_search(location)

    all_candidates = tomtom_candidates + nominatim_candidates
    all_candidates = [c for c in all_candidates if c.get('lat') and c.get('lon')]

    best = None
    if all_candidates:
        best = pick_best_match(all_candidates, location)

    if best is None:
        print(f"[predict] query='{location}' - no reliable candidate found, "
              f"falling back to city-only geocode")
        best = _geocode_city_only(location)

    if best:
        print(f"[predict] query='{location}' picked source={best['source']} -> '{best['name'] or best['address']}'")

    return best


@predict_bp.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json()
    location = data.get('location', '')
    lat = data.get('lat', None)
    lon = data.get('lon', None)
    place_type = "landmark"  # default, overwritten below if we resolve a city

    if location:
        resolved = _resolve_location(location)
        if resolved is None:
            return jsonify({"error": "Location not found"}), 404
        lat = resolved['lat']
        lon = resolved['lon']
        place_type = resolved.get('place_type', 'landmark')
    elif not lat or not lon:
        return jsonify({"error": "Location not found"}), 404

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
        "place_type": place_type,
        "weather": weather,
        "vehicle_count": vehicle_count,
        "current_score": score_now,
        "prediction_30min": score_30,
        "prediction_60min": score_60
    })