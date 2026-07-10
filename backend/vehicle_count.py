import requests
import datetime
import os
from concurrent.futures import ThreadPoolExecutor
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv

load_dotenv()

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY")

# reused across calls, and retries a couple times if TomTom throws a
# 429 or a flaky 5xx (happens more than you'd think on the free tier)
_session = requests.Session()
_retry = Retry(total=2, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
_session.mount("https://", HTTPAdapter(max_retries=_retry))

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
        response = _session.get(url, timeout=5)
        if response.status_code != 200:
            # this print is the important part - tells us EXACTLY why it's failing
            # 401/403 -> key invalid or Traffic API not enabled on this key
            # 429 -> quota/rate limit exceeded
            print(f"[vehicle_count] TomTom flow API failed: status={response.status_code} body={response.text[:200]}")
            return None
        data = response.json()
        flow = data['flowSegmentData']
        current_speed = flow['currentSpeed']
        free_flow_speed = flow['freeFlowSpeed']
        if free_flow_speed == 0:
            return None
        return current_speed / free_flow_speed
    except Exception as e:
        print(f"[vehicle_count] TomTom flow API exception: {e}")
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

    # was doing these one at a time before - fine for a single search, but
    # route_optimizer calls this per sample point per route, so the
    # sequential delay was stacking up enough to trip Render's timeout
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = pool.map(lambda off: get_flow_for_point(lat + off[0], lon + off[1]), offsets)

    ratios = [r for r in results if r is not None]

    if ratios:
        ratios.sort()
        mid = len(ratios) // 2
        # median > mean here - only 5 points, so one bad reading used to
        # skew the whole thing
        median_ratio = ratios[mid] if len(ratios) % 2 else (ratios[mid - 1] + ratios[mid]) / 2
        congestion_factor = 1 - median_ratio

        # base vehicles scaled by time of day + live congestion
        vehicle_count = int(BASE_VEHICLES * time_multiplier * (0.4 + congestion_factor * 1.6))
        return max(vehicle_count, 5)
    else:
        # no TomTom data - estimate from time of day only
        # (if you're seeing this branch hit every single search, check the
        # [vehicle_count] error printed above - that's the real bug to fix)
        print("[vehicle_count] WARNING: all 5 TomTom points failed, using time-only fallback (location ignored)")
        vehicle_count = int(BASE_VEHICLES * time_multiplier)
        return max(vehicle_count, 5)