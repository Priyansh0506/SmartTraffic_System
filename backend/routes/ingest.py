from flask import Blueprint, jsonify, request
from model import predict_congestion, predict_short_term
import datetime


ingest_bp = Blueprint('ingest', __name__)

# store the most recent live ingestion in memory for simple polling by the UI
_LAST_INGEST = {}


@ingest_bp.route('/api/ingest/live', methods=['POST'])
def ingest_live():
    """Accepts periodic aggregated vehicle counts from an external worker
    (e.g., an OpenCV/RTSP ingestion process). Returns the same short-term
    prediction structure the demo and frontend expect so the UI can display
    live results.
    """
    data = request.get_json() or {}
    lat = data.get('lat')
    lon = data.get('lon')
    vehicle_count = data.get('vehicle_count')
    weather = data.get('weather', 'Clear')
    emergency = bool(data.get('emergency', False))

    if vehicle_count is None:
        return jsonify({'error': 'vehicle_count required'}), 400

    now = datetime.datetime.now()
    hour = now.hour
    minute = now.minute
    is_weekend = now.weekday() >= 5

    score = predict_congestion(vehicle_count, weather, hour)
    short_term = predict_short_term(vehicle_count, weather, hour, minute, is_weekend=is_weekend)

    payload = {
        'video_analysis': {
            'vehicle_count': int(vehicle_count),
            'weather': weather,
            'congestion_score': score,
            'frames_analyzed': None,
            'duration_sec': None,
            'brightness': None,
            'blur_score': None
        },
        'short_term_forecast': short_term,
        'emergency': emergency,
        'timestamp': now.isoformat()
    }

    # save last ingest for polling
    global _LAST_INGEST
    _LAST_INGEST = payload

    return jsonify(payload)


@ingest_bp.route('/api/ingest/latest', methods=['GET'])
def ingest_latest():
    if not _LAST_INGEST:
        return jsonify({'error': 'no live data yet'}), 404
    return jsonify(_LAST_INGEST)
