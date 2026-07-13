import requests
from flask import Blueprint, jsonify, request
from routes.predict import _normalize_tomtom, _normalize_nominatim, TOMTOM_API_KEY, _google_search, GOOGLE_API_KEY

geocode_bp = Blueprint('geocode_bp', __name__)


def _suggestions_from_tomtom(query, limit=8):
    if not TOMTOM_API_KEY:
        return []
    url = f"https://api.tomtom.com/search/2/search/{query}.json"
    params = {
        "key": TOMTOM_API_KEY,
        "countrySet": "IN",
        "limit": limit,
        "idxSet": "Geo,PAD",
        "typeahead": "true",
        # rough India-centre bias so small hill towns don't lose to a
        # bigger namesake somewhere else in the country
        "lat": 28.6,
        "lon": 77.2,
        "radius": 1000000,
    }
    try:
        res = requests.get(url, params=params, timeout=5)
        results = res.json().get("results", [])
    except Exception as e:
        print(f"[debug] suggestions - tomtom failed: {e}")
        results = []
    return [_normalize_tomtom(r) for r in results]


def _suggestions_from_nominatim(query, limit=8):
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "jsonv2",
        "addressdetails": 1,
        "countrycodes": "in",
        "limit": limit,
    }
    headers = {"User-Agent": "SmartTrafficSystem/1.0 (contact: your-email@example.com)"}
    try:
        res = requests.get(url, params=params, headers=headers, timeout=5)
        results = res.json() if res.status_code == 200 else []
    except Exception as e:
        print(f"[debug] suggestions - nominatim failed: {e}")
        results = []
    return [_normalize_nominatim(r) for r in results]


@geocode_bp.route('/api/geocode-suggestions', methods=['GET'])
def geocode_suggestions():
    # accept either `q` (old) or `query` (frontend) param
    query = request.args.get('q') or request.args.get('query', '')
    query = (query or '').strip()

    # allow 2-char queries to catch short locality names (e.g. 'st', 'rd')
    if len(query) < 2:
        return jsonify({"suggestions": []})

    # prefer Google (if configured), then TomTom, then Nominatim; merge
    candidates = []
    try:
        if GOOGLE_API_KEY:
            candidates += _google_search(query)
    except Exception:
        pass

    try:
        candidates += _suggestions_from_tomtom(query, limit=12)
    except Exception:
        pass

    try:
        candidates += _suggestions_from_nominatim(query, limit=12)
    except Exception:
        pass

    # drop anything with missing coords
    candidates = [c for c in candidates if c.get('lat') and c.get('lon')]

    # dedupe similar coordinates (rounding) and prefer earlier (higher-ranked) candidates
    seen = set()
    suggestions = []
    for c in candidates:
        display_name = (c.get('address') or c.get('display_name') or c.get('name') or '')
        name = c.get('name') or (display_name.split(',')[0] if display_name else '')
        try:
            latf = float(c['lat'])
            lonf = float(c['lon'])
        except Exception:
            continue
        key = (round(latf, 5), round(lonf, 5))
        if not display_name or key in seen:
            continue
        seen.add(key)
        suggestions.append({
            "name": name,
            "display_name": display_name,
            "lat": latf,
            "lon": lonf,
            "place_type": c.get('place_type', 'landmark'),
        })

    return jsonify({"suggestions": suggestions[:12]})