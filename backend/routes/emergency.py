from flask import Blueprint, request, jsonify
from route_optimizer import geocode_location, collect_route_candidates, decode_polyline, score_route_congestion

emergency_bp = Blueprint("emergency_bp", __name__)

# rough estimate of how much quicker an emergency vehicle gets there once
# the road ahead is cleared for it. ambulance gets a bit more priority
# than fire trucks since fire trucks are bigger and can't really speed
# through narrow turns the same way
SPEEDUP = {
    "ambulance": 0.55,
    "fire": 0.6
}


@emergency_bp.route("/api/emergency-route", methods=["POST"])
def emergency_route_api():
    data = request.get_json()

    source = data.get("source")
    destination = data.get("destination")
    vehicle_type = data.get("vehicle_type", "ambulance")

    if not source or not destination:
        return jsonify({"error": "Both source and destination are required"}), 400

    if vehicle_type not in SPEEDUP:
        vehicle_type = "ambulance"  # default if frontend sends something weird

    source_coords = geocode_location(source)
    if not source_coords:
        return jsonify({"error": "Could not find location: " + source}), 400

    dest_coords = geocode_location(destination)
    if not dest_coords:
        return jsonify({"error": "Could not find location: " + destination}), 400

    routes, err = collect_route_candidates(source_coords, dest_coords)
    if err:
        return jsonify({"error": err}), 400
    if not routes:
        return jsonify({"error": "NO_ROUTES_FOUND"}), 400

    # for a normal driver we'd pick the least congested road, but an
    # ambulance/fire truck doesn't need to avoid traffic - it gets a
    # cleared path, so just grab whichever road is the shortest in time
    best = routes[0]
    for r in routes:
        if r["duration"] < best["duration"]:
            best = r

    coords = decode_polyline(best["geometry"])
    avg_score, segments = score_route_congestion(coords)

    # mark the whole stretch as cleared since traffic is supposed to
    # move out of the way along this route
    for s in segments:
        s["status"] = "Cleared"
        s["congestion_score"] = 0

    distance_km = round(best["distance"] / 1000, 1)
    normal_eta = round(best["duration"] / 60)
    cleared_eta = round(normal_eta * SPEEDUP[vehicle_type])
    if cleared_eta < 1:
        cleared_eta = 1

    return jsonify({
        "source_coords": list(source_coords),
        "destination_coords": list(dest_coords),
        "vehicle_type": vehicle_type,
        "distance_km": distance_km,
        "normal_duration_min": normal_eta,
        "duration_min": cleared_eta,
        "time_saved_min": normal_eta - cleared_eta,
        "segments": segments,
        "coordinates": [[lat, lon] for lat, lon in coords]
    })