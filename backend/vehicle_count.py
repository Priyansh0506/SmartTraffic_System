import requests

TOMTOM_API_KEY = "jH5ES6h0SgbDwRBUqrVRqM89aD8LGRNw"


def count_vehicles(lat=29.9457, lon=78.1642):
    """
    IMPORTANT: TomTom's Flow Segment Data API does NOT return an actual
    vehicle count. It returns current speed vs free-flow speed for a road
    segment. We derive an ESTIMATED vehicle count from how much slower
    traffic is moving than usual (more slowdown -> assumed more vehicles).

    This is a proxy/estimate for live congestion at `location`, used to
    cross-check the video-based detection — it is not literal ground
    truth for any specific clip.
    """
    url = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point={lat},{lon}&key={TOMTOM_API_KEY}"

    try:
        response = requests.get(url, timeout=5)
        data = response.json()

        current_speed = data['flowSegmentData']['currentSpeed']
        free_flow_speed = data['flowSegmentData']['freeFlowSpeed']

        speed_ratio = current_speed / free_flow_speed if free_flow_speed else 1

        base_traffic = 8
        vehicle_count = base_traffic + int((1 - speed_ratio) * 90)
        return max(vehicle_count, 0)

    except Exception:
        return 25