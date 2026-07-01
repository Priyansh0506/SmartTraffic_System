import requests

def get_weather(lat=29.9457, lon=78.1642):
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"

    try:
        response = requests.get(url, timeout=5)
        data = response.json()

        weather_code = data['current_weather']['weathercode']
        wind_speed = data['current_weather']['windspeed']
    except Exception:
        # Open-Meteo down/slow/unexpected response - fall back to a
        # neutral default instead of crashing the whole prediction request
        return "Clear", 0

    if weather_code == 0:
        condition = "Clear"
    elif weather_code in [1, 2, 3]:
        condition = "Cloudy"
    elif weather_code in [61, 63, 65]:
        condition = "Rainy"
    else:
        condition = "Foggy"

    return condition, wind_speed