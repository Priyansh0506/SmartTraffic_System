import requests


def get_weather(lat=29.9457, lon=78.1642):
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current_weather=true"
        f"&hourly=precipitation"
        f"&timezone=auto"
    )

    try:
        response = requests.get(url, timeout=5)
        data = response.json()

        weather_code = data['current_weather']['weathercode']
        wind_speed = data['current_weather']['windspeed']

        # Try to pull the precipitation value for the current hour
        # so we can catch real-time rain that the weathercode misses
        current_precip = 0
        try:
            current_time = data['current_weather']['time']  # e.g. "2026-07-10T10:15"
            current_hour_key = current_time[:13] + ":00"      # round down to the hour
            hourly_times = data['hourly']['time']
            hourly_precip = data['hourly']['precipitation']
            if current_hour_key in hourly_times:
                idx = hourly_times.index(current_hour_key)
                current_precip = hourly_precip[idx]
        except Exception:
            current_precip = 0

    except Exception:
        # Open-Meteo down/slow/unexpected response - fall back to a
        # neutral default instead of crashing the whole prediction request
        return "Clear", 0

    # Full WMO Weather interpretation codes (Open-Meteo docs)
    if weather_code == 0:
        condition = "Clear"
    elif weather_code in [1, 2, 3]:
        condition = "Cloudy"
    elif weather_code in [45, 48]:
        condition = "Foggy"
    elif weather_code in [51, 53, 55, 56, 57]:
        condition = "Drizzle"
    elif weather_code in [61, 63, 65, 66, 67, 80, 81, 82]:
        condition = "Rainy"
    elif weather_code in [71, 73, 75, 77, 85, 86]:
        condition = "Snowy"
    elif weather_code in [95, 96, 99]:
        condition = "Thunderstorm"
    else:
        condition = "Cloudy"  # safe fallback instead of wrongly labeling Foggy

    # Override: if actual precipitation is happening right now but the
    # weathercode hasn't caught up (common with isolated/local showers),
    # trust the precipitation number instead.
    if current_precip and current_precip > 0 and condition not in ["Rainy", "Thunderstorm", "Snowy"]:
        condition = "Rainy"

    return condition, wind_speed