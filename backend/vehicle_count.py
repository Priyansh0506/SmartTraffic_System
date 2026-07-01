import requests
import datetime

TOMTOM_API_KEY = "jH5ES6h0SgbDwRBUqrVRqM89aD8LGRNw"

# Indian city traffic pattern by hour
HOURLY_MULTIPLIER = {
    0: 0.3, 1: 0.2, 2: 0.15, 3: 0.15, 4: 0.2, 5: 0.4,
    6: 0.7, 7: 1.0, 8: 1.5, 9: 1.6, 10: 1.3, 11: 1.1,
    12: 1.2, 13: 1.2, 14: 1.1, 15: 1.1, 16: 1.2, 17: 1.5,
    18: 1.7, 19: 1.6, 20: 1.2, 21: 0.9, 22: 0.6, 23: 0.4
}

BASE_VEHICLES = 35


def get_flow_for_point(lat, lon):
    # zoom=18 gives road-level data
    url = (
        f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/18/json"
        f"?point={lat},{lon}&key={TOMTOM_API_KEY}&unit=KMPH"
    )
    try:
        response = requests.get(url, timeout=5)
        data = response.json()
        flow = data['flowSegmentData']
        current_speed = flow['currentSpeed']
        free_flow_speed = flow['freeFlowSpeed']
        if free_flow_speed == 0:
            return None
        return current_speed / free_flow_speed
    except Exception:
        return None


def count_vehicles(lat=29.9457, lon=78.1642):
    hour = datetime.datetime.now().hour
    time_multiplier = HOURLY_MULTIPLIER.get(hour, 1.0)

    # check main point + 4 nearby points around the location
    # helps when TomTom has no road data exactly at searched point
    offsets = [
        (0, 0),
        (0.003, 0),
        (-0.003, 0),
        (0, 0.003),
        (0, -0.003),
    ]

    ratios = []
    for dlat, dlon in offsets:
        ratio = get_flow_for_point(lat + dlat, lon + dlon)
        if ratio is not None:
            ratios.append(ratio)

    if ratios:
        avg_ratio = sum(ratios) / len(ratios)
        congestion_factor = 1 - avg_ratio

        # base vehicles scaled by time of day + live congestion
        vehicle_count = int(BASE_VEHICLES * time_multiplier * (0.4 + congestion_factor * 1.6))
        return max(vehicle_count, 5)
    else:
        # no TomTom data - estimate from time of day only
        vehicle_count = int(BASE_VEHICLES * time_multiplier)
        return max(vehicle_count, 5)