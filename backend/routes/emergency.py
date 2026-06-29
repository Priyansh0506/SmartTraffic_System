from flask import Blueprint, jsonify, request

emergency_bp = Blueprint('emergency', __name__)

@emergency_bp.route('/api/emergency-route', methods=['POST'])
def emergency_route():
    data = request.get_json()
    
    # get origin and destination from request
    origin = data.get('origin', '')
    destination = data.get('destination', '')
    vehicle_type = data.get('vehicle_type', 'ambulance')
    
    # emergency vehicles ignore congestion weights
    # they always get the fastest direct route
    route = {
        "origin": origin,
        "destination": destination,
        "vehicle_type": vehicle_type,
        "route_type": "emergency_priority",
        "congestion_ignored": True,
        "estimated_time": "8 mins",
        "distance": "3.2 km",
        "instructions": "Take the fastest available corridor, ignore traffic signals"
    }
    
    return jsonify({
        "status": "success",
        "message": f"Priority route calculated for {vehicle_type}",
        "route": route
    })