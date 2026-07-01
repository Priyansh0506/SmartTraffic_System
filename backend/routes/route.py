from flask import Blueprint, request, jsonify
from route_optimizer import optimize_route

route_bp = Blueprint("route_bp", __name__)


@route_bp.route("/api/optimize-route", methods=["POST"])
def optimize_route_api():
    data = request.get_json()

    source = data.get("source")
    destination = data.get("destination")

    if not source or not destination:
        return jsonify({"error": "Both source and destination are required"}), 400

    result = optimize_route(source, destination)

    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)