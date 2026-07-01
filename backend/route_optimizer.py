import re
import math
import requests
from vehicle_count import count_vehicles

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "http://router.project-osrm.org/route/v1/driving"

HEADERS = {"User-Agent": "SmartTrafficSystem/1.0"}

SAMPLE_POINTS_PER_ROUTE = 6
MAX_ROUTES = 3

COORD_PATTERN = re.compile(r"^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$")


def geocode_location(place_name):
    """
    Converts a place into (lat, lon). If the input is already a
    "lat,lon" pair, it's used directly - skips Nominatim entirely so
    precise GPS coordinates never fail to resolve.
    """
    match = COORD_PATTERN.match(place_name)
    if match:
        return float(match.group(1)), float(match.group(3))

    params = {"q": place_name, "format": "json", "limit": 1}
    res = requests.get(NOMINATIM_URL, params=params, headers=HEADERS, timeout=10)
    results = res.json()

    if not results:
        return None

    return float(results[0]["lat"]), float(results[0]["lon"])


def decode_polyline(polyline_str):
    index, lat, lon = 0, 0, 0
    coordinates = []
    length = len(polyline_str)

    while index < length:
        for unit in ["lat", "lon"]:
            shift, result = 0, 0
            while True:
                b = ord(polyline_str[index]) - 63
                index += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if (result & 1) else (result >> 1)
            if unit == "lat":
                lat += delta
            else:
                lon += delta

        coordinates.append((lat / 1e5, lon / 1e5))

    return coordinates


def haversine_km(p1, p2):
    lat1, lon1 = p1
    lat2, lon2 = p2
    r = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return r * 2 * math.asin(math.sqrt(a))


def offset_waypoint(source_coords, dest_coords, side):
    """
    Picks a point off to one side of the direct source-to-destination line.
    Routing OSRM through this point nudges it onto a genuinely different
    road than the default shortest path - this is what lets us get real
    alternate routes even when OSRM's own "alternatives" flag only finds one.
    """
    mid_lat = (source_coords[0] + dest_coords[0]) / 2
    mid_lon = (source_coords[1] + dest_coords[1]) / 2

    dlat = dest_coords[0] - source_coords[0]
    dlon = dest_coords[1] - source_coords[1]
    length = math.hypot(dlat, dlon)
    if length == 0:
        return mid_lat, mid_lon

    # perpendicular direction to the source-destination line
    perp_lat = -dlon / length
    perp_lon = dlat / length

    trip_km = haversine_km(source_coords, dest_coords)
    offset_km = max(2, trip_km * 0.18)  # how far off the direct line to push the detour
    offset_deg = offset_km / 111  # rough km-to-degrees conversion

    return mid_lat + perp_lat * offset_deg * side, mid_lon + perp_lon * offset_deg * side


def pick_sample_points_with_distance(coords, count):
    if len(coords) < 2:
        return [(coords[0], 0)] if coords else []

    step = max(1, len(coords) // count)
    indices = list(range(0, len(coords), step))[:count]
    if indices[-1] != len(coords) - 1:
        indices.append(len(coords) - 1)

    samples = []
    cumulative_km = 0
    last_point = coords[0]

    for idx in range(len(coords)):
        cumulative_km += haversine_km(last_point, coords[idx])
        last_point = coords[idx]
        if idx in indices:
            samples.append((coords[idx], round(cumulative_km, 1)))

    return samples


def status_for_score(score):
    if score <= 3:
        return "Clear"
    if score <= 6:
        return "Moderate"
    return "Heavy"


def score_route_congestion(coords):
    sample_points = pick_sample_points_with_distance(coords, SAMPLE_POINTS_PER_ROUTE)

    segments = []
    scores = []

    for (lat, lon), distance_km in sample_points:
        vehicles = count_vehicles(lat=lat, lon=lon)
        score = min(10, round(vehicles / 20, 1))
        scores.append(score)
        segments.append({
            "distance_km": distance_km,
            "congestion_score": score,
            "status": status_for_score(score),
        })

    avg_score = round(sum(scores) / len(scores), 1) if scores else 5.0
    return avg_score, segments


def call_osrm(coord_chain, alternatives=True):
    """
    coord_chain is a list of (lat, lon) tuples - 2 points for a direct
    route, 3 for a route forced through a waypoint. Returns the raw
    OSRM route list, or None on failure.
    """
    points_str = ";".join(f"{lon},{lat}" for lat, lon in coord_chain)
    url = f"{OSRM_URL}/{points_str}"
    params = {
        "alternatives": "true" if alternatives else "false",
        "overview": "full",
        "geometries": "polyline",
    }

    try:
        res = requests.get(url, params=params, timeout=10)
        data = res.json()
    except requests.RequestException:
        return None, "NETWORK_ERROR"

    if data.get("code") != "Ok":
        return None, data.get("code", "ROUTING_FAILED")

    return data["routes"], None


def is_duplicate_route(candidate, existing_routes):
    """
    Two routes that end up with near-identical distance and duration are
    basically the same road - no point showing both, so we drop one.
    """
    for r in existing_routes:
        if (abs(r["distance"] - candidate["distance"]) < 800
                and abs(r["duration"] - candidate["duration"]) < 90):
            return True
    return False


def collect_route_candidates(source_coords, dest_coords):
    """
    Tries to gather at least MAX_ROUTES genuinely different road options.
    Starts with OSRM's own alternatives, then if that's not enough,
    forces detours through waypoints on either side of the direct path.
    """
    candidates = []

    direct_routes, error = call_osrm([source_coords, dest_coords])
    if error:
        return [], error
    candidates.extend(direct_routes)

    if len(candidates) < MAX_ROUTES:
        for side in (1, -1):
            if len(candidates) >= MAX_ROUTES:
                break
            via = offset_waypoint(source_coords, dest_coords, side)
            detour_routes, detour_error = call_osrm(
                [source_coords, via, dest_coords], alternatives=False
            )
            if detour_error or not detour_routes:
                continue
            for r in detour_routes:
                if not is_duplicate_route(r, candidates):
                    candidates.append(r)

    return candidates, None


def optimize_route(source, destination):
    source_coords = geocode_location(source)
    if not source_coords:
        return {"error": f"Could not find location: {source}"}

    dest_coords = geocode_location(destination)
    if not dest_coords:
        return {"error": f"Could not find location: {destination}"}

    routes, error = collect_route_candidates(source_coords, dest_coords)

    if error:
        return {"error": error}

    if not routes:
        return {"error": "NO_ROUTES_FOUND"}

    ranked_routes = []

    for i, route in enumerate(routes):
        polyline = route["geometry"]
        coords = decode_polyline(polyline)

        congestion_score, segments = score_route_congestion(coords)
        distance_km = round(route["distance"] / 1000, 1)
        duration_min = round(route["duration"] / 60)

        ranked_routes.append({
            "route_id": i,
            "summary": f"Route {i + 1}",
            "distance_km": distance_km,
            "duration_min": duration_min,
            "congestion_score": congestion_score,
            "status": status_for_score(congestion_score),
            "segments": segments,
            "coordinates": [[lat, lon] for lat, lon in coords],
        })

    ranked_routes.sort(key=lambda r: (r["congestion_score"], r["duration_min"]))
    top_routes = ranked_routes[:MAX_ROUTES]

    for rank, r in enumerate(top_routes):
        r["route_id"] = rank
        r["summary"] = f"Route {rank + 1}"

    return {
        "source_coords": list(source_coords),
        "destination_coords": list(dest_coords),
        "best_route": top_routes[0],
        "all_routes": top_routes,
    }