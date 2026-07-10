from flask import Blueprint, jsonify, request
from model import predict_congestion, predict_short_term, get_peak_hour_profile
from route_optimizer import geocode_location, collect_route_candidates, decode_polyline, status_for_score
from ultralytics import YOLO
import cv2
import numpy as np
import tempfile
import os
import datetime

demo_bp = Blueprint('demo', __name__)

# COCO class ids that count as "vehicle" for this project
_VEHICLE_CLASS_IDS = {2, 3, 5, 7}  # car, motorcycle, bus, truck

_vehicle_model = None


def _get_vehicle_model():
    """
    Loaded once and reused across requests - loading yolov8n fresh on
    every upload would add several seconds of dead time to every
    analysis for no reason.
    """
    global _vehicle_model
    if _vehicle_model is None:
        # yolov8n is the smallest/fastest YOLOv8 variant - accurate
        # enough for counting cars/bikes/buses/trucks and still fast
        # on CPU, which matters since this runs per uploaded video
        _vehicle_model = YOLO('yolov8n.pt')
    return _vehicle_model


def analyze_video_frames(video_path):
    """
    Runs real object detection per sampled frame instead of motion-blob
    counting. Background subtraction used to miss stationary vehicles
    entirely and merge overlapping ones into a single blob - actual
    detection doesn't have either problem, it recognizes each vehicle
    on its own regardless of whether it's moving.
    """
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        return None, None

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25

    # detection per frame is heavier than background subtraction, so
    # sample a bit less often (~every 1.5s) - per-frame accuracy more
    # than makes up for fewer samples
    sample_interval = max(1, int(fps * 1.5))

    model = _get_vehicle_model()

    vehicle_counts = []
    brightness_vals = []
    blur_vals = []

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_interval == 0:
            results = model.predict(frame, verbose=False, conf=0.35)[0]
            count = sum(
                1 for c in results.boxes.cls.tolist()
                if int(c) in _VEHICLE_CLASS_IDS
            )
            vehicle_counts.append(count)

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness_vals.append(np.mean(gray))
            blur_vals.append(cv2.Laplacian(gray, cv2.CV_64F).var())

        frame_idx += 1

    cap.release()

    if not vehicle_counts:
        return None, None

    # real per-frame detections - median gives the "typical" count
    # across the clip. No percentile-inflation hack needed here like
    # the old blob-counting method required to compensate for
    # undercounting.
    avg_vehicles = int(np.median(vehicle_counts))
    avg_brightness = np.mean(brightness_vals)
    avg_blur = np.mean(blur_vals)

    # weather detection from video brightness and blur
    if avg_brightness < 55:
        detected_weather = "Foggy"
    elif avg_blur < 40:
        detected_weather = "Foggy"
    elif avg_brightness < 90:
        detected_weather = "Cloudy"
    elif avg_brightness < 130:
        detected_weather = "Cloudy"
    else:
        detected_weather = "Clear"

    return {
        "vehicle_count": avg_vehicles,
        "weather": detected_weather,
        "avg_brightness": round(float(avg_brightness), 1),
        "blur_score": round(float(avg_blur), 1),
        "frames_analyzed": len(vehicle_counts),
        "video_duration_sec": round(total_frames / fps, 1)
    }, total_frames


@demo_bp.route('/api/demo/analyze', methods=['POST'])
def analyze_demo():
    if 'video' not in request.files:
        return jsonify({"error": "No video file uploaded"}), 400

    video_file = request.files['video']
    suffix = os.path.splitext(video_file.filename)[-1] or '.mp4'

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        video_file.save(tmp.name)
        tmp_path = tmp.name

    try:
        video_data, total_frames = analyze_video_frames(tmp_path)

        if not video_data:
            return jsonify({"error": "Could not process video"}), 500

        now = datetime.datetime.now()
        hour = now.hour
        minute = now.minute
        is_weekend = now.weekday() >= 5  # Sat=5, Sun=6

        video_score = predict_congestion(video_data['vehicle_count'], video_data['weather'], hour)

        short_term = predict_short_term(
            video_data['vehicle_count'], video_data['weather'], hour, minute,
            is_weekend=is_weekend
        )

        # same 24hr curve the live-monitor peak-hours route uses - the
        # only difference is the baseline count/weather comes straight
        # from this video instead of a lat/lon lookup. No lat/lon here,
        # so no location_seed - weekday/weekend curve is still applied.
        peak_profile = get_peak_hour_profile(
            video_data['vehicle_count'], video_data['weather'], hour,
            is_weekend=is_weekend
        )

        return jsonify({
            "video_analysis": {
                "vehicle_count": video_data['vehicle_count'],
                "weather": video_data['weather'],
                "congestion_score": video_score,
                "frames_analyzed": video_data['frames_analyzed'],
                "duration_sec": video_data['video_duration_sec'],
                "brightness": video_data['avg_brightness'],
                "blur_score": video_data['blur_score']
            },
            "short_term_forecast": short_term,
            "peak_hour_profile": {
                "weather": video_data['weather'],
                "current_hour": hour,
                "profile": peak_profile
            }
        })

    finally:
        os.unlink(tmp_path)


@demo_bp.route('/api/demo/route', methods=['POST'])
def demo_route():
    data = request.get_json()

    source = data.get('source')
    destination = data.get('destination')
    vehicle_count = data.get('vehicle_count')
    emergency = data.get('emergency', False)
    vehicle_type = data.get('vehicle_type', 'ambulance')

    if not source or not destination or vehicle_count is None:
        return jsonify({"error": "source, destination and vehicle_count are required"}), 400

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

    if emergency:
        # don't dodge traffic here, just go whichever way is fastest and
        # assume it gets cleared for the vehicle
        chosen = routes[0]
        for r in routes:
            if r['duration'] < chosen['duration']:
                chosen = r
    else:
        # the video only gives us one vehicle count for the whole clip,
        # not per-road data, so every candidate route would score the
        # same anyway - just go with the shortest one
        chosen = routes[0]
        for r in routes:
            if r['distance'] < chosen['distance']:
                chosen = r

    coords = decode_polyline(chosen['geometry'])
    distance_km = round(chosen['distance'] / 1000, 1)
    duration_min = round(chosen['duration'] / 60)

    score = min(10, round(vehicle_count / 20, 1))
    status = status_for_score(score)

    # spread the same score across a few checkpoints along the route so
    # the UI can still show a "route ahead" style breakdown
    segment_count = 6
    segments = []
    for i in range(segment_count):
        segments.append({
            "distance_km": round(distance_km * (i + 1) / segment_count, 1),
            "congestion_score": score,
            "status": status
        })

    response = {
        "source_coords": list(source_coords),
        "destination_coords": list(dest_coords),
        "distance_km": distance_km,
        "duration_min": duration_min,
        "congestion_score": score,
        "status": status,
        "segments": segments,
        "coordinates": [[lat, lon] for lat, lon in coords],
        "emergency": emergency
    }

    if emergency:
        speedup = 0.55 if vehicle_type == 'ambulance' else 0.6
        cleared_min = max(1, round(duration_min * speedup))

        response["status"] = "Cleared"
        response["congestion_score"] = 0
        response["normal_duration_min"] = duration_min
        response["duration_min"] = cleared_min
        response["time_saved_min"] = duration_min - cleared_min
        response["vehicle_type"] = vehicle_type
        for s in segments:
            s["status"] = "Cleared"
            s["congestion_score"] = 0

    return jsonify(response)