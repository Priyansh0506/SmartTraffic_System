import cv2
import time
import requests
import argparse
from ultralytics import YOLO
import numpy as np

# COCO class ids that count as "vehicle" for this project
_VEHICLE_CLASS_IDS = {2, 3, 5, 7}  # car, motorcycle, bus, truck


def detect_vehicles_and_emergency(frame, model, conf=0.35):
    """Run YOLO on a frame and return vehicle count and a simple 'emergency'
    heuristic: if a detected vehicle's top region has a strong red channel (simulating a siren),
    mark as emergency. This is only a demo heuristic and not production-grade.
    """
    results = model.predict(frame, verbose=False, conf=conf)[0]
    classes = results.boxes.cls.tolist()
    boxes = results.boxes.xyxy.tolist()

    count = 0
    emergency = False
    h, w = frame.shape[:2]

    for cls, box in zip(classes, boxes):
        if int(cls) in _VEHICLE_CLASS_IDS:
            count += 1
            x1, y1, x2, y2 = map(int, box)
            # constrain box to frame
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w - 1, x2), min(h - 1, y2)
            if x2 <= x1 or y2 <= y1:
                continue
            # check top 20% of bbox for red beacon (very naive)
            top_h = max(1, int((y2 - y1) * 0.2))
            roi = frame[y1:y1 + top_h, x1:x2]
            if roi.size == 0:
                continue
            mean = roi.mean(axis=(0, 1))  # BGR
            # red channel significantly higher than others
            if mean[2] > 110 and mean[2] > mean[1] + 30 and mean[2] > mean[0] + 30:
                emergency = True
    return count, emergency


def run_worker(source, lat, lon, backend_url, sample_interval=1.0, agg_interval=10.0):
    print(f"Starting worker source={source} backend={backend_url} sample_interval={sample_interval} agg_interval={agg_interval}")
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print("Could not open source:", source)
        return

    model = YOLO('yolov8n.pt')

    last_agg = time.time()
    counts = []
    emergency_flag = False

    try:
        while True:
            start = time.time()
            ret, frame = cap.read()
            if not ret:
                print("Stream ended or could not fetch frame")
                break

            count, emergency = detect_vehicles_and_emergency(frame, model)
            counts.append(count)
            if emergency:
                emergency_flag = True

            # aggregate periodically
            if time.time() - last_agg >= agg_interval:
                if counts:
                    median_count = int(np.median(counts))
                else:
                    median_count = 0
                payload = {
                    'lat': lat,
                    'lon': lon,
                    'vehicle_count': int(median_count),
                    'weather': 'Clear',
                    'emergency': bool(emergency_flag)
                }
                try:
                    res = requests.post(backend_url.rstrip('/') + '/api/ingest/live', json=payload, timeout=8)
                    print(f"Posted aggregated counts -> {payload} | status={res.status_code}")
                    if res.status_code == 200:
                        print(res.json())
                except Exception as e:
                    print("Failed to post aggregated counts:", e)

                counts = []
                emergency_flag = False
                last_agg = time.time()

            # sleep until next sample
            elapsed = time.time() - start
            to_sleep = max(0, sample_interval - elapsed)
            time.sleep(to_sleep)
    finally:
        cap.release()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='RTSP / video ingestion worker demo')
    parser.add_argument('--source', required=True, help='RTSP URL or path to video file')
    parser.add_argument('--lat', type=float, default=12.9716, help='Latitude for demo ingestion')
    parser.add_argument('--lon', type=float, default=77.5946, help='Longitude for demo ingestion')
    parser.add_argument('--backend', default='http://127.0.0.1:5000', help='Backend base URL')
    parser.add_argument('--sample-interval', type=float, default=1.0, help='Seconds between frame samples')
    parser.add_argument('--agg-interval', type=float, default=10.0, help='Seconds between aggregated POSTs')
    args = parser.parse_args()

    run_worker(args.source, args.lat, args.lon, args.backend, args.sample_interval, args.agg_interval)
