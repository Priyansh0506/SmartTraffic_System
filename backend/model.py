import numpy as np
from tensorflow import keras

def load_model():
    try:
        model = keras.models.load_model('ml_model/traffic_model.h5')
        return model
    except:
        return None


def predict_congestion(vehicle_count, weather, hour):
    """
    Rule-based congestion scorer (used as fallback until the trained
    keras model is wired in). Score range: 0 (clear) - 10 (gridlock).
    """
    base_score = vehicle_count / 10

    if weather == "Rainy":
        base_score += 2
    elif weather == "Foggy":
        base_score += 1.5
    elif weather == "Cloudy":
        base_score += 0.5

    # rush hours morning and evening
    if hour in [8, 9, 10, 17, 18, 19]:
        base_score += 1.5

    congestion_score = min(round(base_score, 1), 10.0)

    return congestion_score


# typical traffic multiplier curve across a 24-hour day,
# relative to an "average" hour (1.0 = average).
# tuned for a typical Indian city road pattern.
HOURLY_MULTIPLIER = {
    0: 0.3, 1: 0.2, 2: 0.15, 3: 0.15, 4: 0.2, 5: 0.4,
    6: 0.7, 7: 1.0, 8: 1.5, 9: 1.6, 10: 1.3, 11: 1.1,
    12: 1.2, 13: 1.2, 14: 1.1, 15: 1.1, 16: 1.2, 17: 1.5,
    18: 1.7, 19: 1.6, 20: 1.2, 21: 0.9, 22: 0.6, 23: 0.4
}


def predict_short_term(vehicle_count, weather, current_hour, current_minute=0):
    """
    Predicts congestion 30 minutes and 60 minutes from now.
    Uses linear interpolation between the current hour's traffic
    multiplier and the next hour's, based on how far into the
    current hour we are — gives a smoother short-term estimate
    than jumping straight to the next hour's bucket.
    """
    def multiplier_at(hour_offset_minutes):
        total_minutes = current_hour * 60 + current_minute + hour_offset_minutes
        total_minutes = total_minutes % (24 * 60)
        hour = total_minutes // 60
        minute_frac = (total_minutes % 60) / 60.0
        next_hour = (hour + 1) % 24
        m1 = HOURLY_MULTIPLIER.get(hour, 1.0)
        m2 = HOURLY_MULTIPLIER.get(next_hour, 1.0)
        return m1 + (m2 - m1) * minute_frac, (hour + (1 if minute_frac >= 0.5 else 0)) % 24

    current_multiplier = HOURLY_MULTIPLIER.get(current_hour, 1.0)
    baseline_vehicles = vehicle_count / current_multiplier if current_multiplier > 0 else vehicle_count

    results = {}
    for label, mins in [("in_30_min", 30), ("in_60_min", 60)]:
        mult, eff_hour = multiplier_at(mins)
        projected_vehicles = max(int(baseline_vehicles * mult), 0)
        projected_score = predict_congestion(projected_vehicles, weather, eff_hour)
        results[label] = {
            "projected_vehicles": projected_vehicles,
            "projected_congestion": projected_score
        }

    return results


def predict_future_congestion(vehicle_count, weather, current_hour, hours_ahead=6):
    """
    Projects congestion score for the next `hours_ahead` hours using
    the current detected vehicle count as a baseline, scaled by typical
    hourly traffic patterns. This is a heuristic trend projection, not
    a learned time-series forecast — it answers "if current traffic is
    X, what does the next few hours likely look like given normal daily
    rush-hour patterns".
    """
    current_multiplier = HOURLY_MULTIPLIER.get(current_hour, 1.0)
    # avoid divide by zero, and avoid wildly scaling up tiny counts
    baseline_vehicles = vehicle_count / current_multiplier if current_multiplier > 0 else vehicle_count

    forecast = []
    for i in range(1, hours_ahead + 1):
        future_hour = (current_hour + i) % 24
        future_multiplier = HOURLY_MULTIPLIER.get(future_hour, 1.0)
        projected_vehicles = max(int(baseline_vehicles * future_multiplier), 0)
        projected_score = predict_congestion(projected_vehicles, weather, future_hour)

        forecast.append({
            "hour": future_hour,
            "hours_ahead": i,
            "projected_vehicles": projected_vehicles,
            "projected_congestion": projected_score
        })

    return forecast