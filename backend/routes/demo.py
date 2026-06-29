from flask import Blueprint, jsonify, request
from model import predict_congestion, predict_short_term
import cv2
import numpy as np
import tempfile
import os
import datetime

demo_bp = Blueprint('demo', __name__)


def analyze_video_frames(video_path):
    """
    Extract frames from video and do basic analysis.
    Returns detected vehicle count and weather condition estimate
    purely from the uploaded footage.
    """
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        return None, None

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25  # fallback if fps read fails
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    frame_area = frame_width * frame_height

    # scale the min-blob-area threshold to the video's resolution instead
    # of using a fixed 800px value — fixed values undercount on
    # high-res footage where each vehicle covers more pixels proportionally
    # but also undercount small/distant vehicles. Use a smaller relative
    # threshold so distant/small vehicles aren't dropped.
    min_blob_area = max(150, int(frame_area * 0.0008))

    sample_interval = max(1, int(fps))

    vehicle_counts = []
    brightness_vals = []
    blur_vals = []

    bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=80, varThreshold=25, detectShadows=True)

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_interval == 0:
            fg_mask = bg_subtractor.apply(frame)

            # remove shadow pixels (MOG2 marks them as gray ~127) before counting
            _, fg_mask = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
            fg_mask = cv2.dilate(fg_mask, kernel, iterations=2)
            fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)

            contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            vehicle_blobs = [c for c in contours if cv2.contourArea(c) > min_blob_area]
            vehicle_counts.append(len(vehicle_blobs))

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness = np.mean(gray)
            blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()

            brightness_vals.append(brightness)
            blur_vals.append(blur_score)

        frame_idx += 1

    cap.release()

    # skip first few sampled frames -> background subtractor warm-up,
    # these frames almost always undercount badly
    if len(vehicle_counts) > 6:
        vehicle_counts = vehicle_counts[4:]

    if not vehicle_counts:
        return None, None

    # use the 75th percentile instead of median — background subtraction
    # tends to undercount more often than overcount (occlusion, merging
    # blobs of close vehicles), so leaning slightly higher compensates
    avg_vehicles = int(np.percentile(vehicle_counts, 75))
    avg_brightness = np.mean(brightness_vals)
    avg_blur = np.mean(blur_vals)

    if avg_brightness < 60:
        detected_weather = "Foggy"
    elif avg_blur < 50:
        detected_weather = "Foggy"
    elif avg_brightness < 100:
        detected_weather = "Cloudy"
    else:
        detected_weather = "Clear"

    video_duration_sec = total_frames / fps if fps > 0 else 0

    return {
        "vehicle_count": avg_vehicles,
        "weather": detected_weather,
        "avg_brightness": round(float(avg_brightness), 1),
        "blur_score": round(float(avg_blur), 1),
        "frames_analyzed": len(vehicle_counts),
        "video_duration_sec": round(video_duration_sec, 1)
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

        hour = datetime.datetime.now().hour
        minute = datetime.datetime.now().minute
        video_score = predict_congestion(video_data['vehicle_count'], video_data['weather'], hour)

        # short-term (30 min / 60 min) forecast
        short_term = predict_short_term(
            video_data['vehicle_count'], video_data['weather'], hour, minute
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
            "short_term_forecast": short_term
        })

    finally:
        os.unlink(tmp_path)