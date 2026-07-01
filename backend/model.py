import numpy as np
import random
from tensorflow import keras
from tensorflow.keras import layers
import joblib
import os

# ---------- Load the model and scaler once (avoid reloading every time) ----------
_WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), "ml_model", "traffic_model.weights.h5")
_SCALER_PATH = os.path.join(os.path.dirname(__file__), "ml_model", "scaler.save")

_model = None
_scaler = None

WEATHER_TO_NUMBER = {
    "Clear": 0,
    "Cloudy": 1,
    "Rainy": 2,
    "Foggy": 3,
}


def _build_model_architecture():
    """
    Build the model architecture here in code (same as in train_model.py -
    3 inputs, 2 hidden layers, 1 output). This means only the "weights"
    (numbers) need to be loaded from file, not the full model object -
    this avoids the TensorFlow version mismatch issue (which is what
    caused the earlier error with the full .h5 model approach).
    """
    model = keras.Sequential([
        layers.Input(shape=(3,)),
        layers.Dense(16, activation="relu"),
        layers.Dense(8, activation="relu"),
        layers.Dense(1)
    ])
    return model


def load_model():
    """Build the model architecture, then load only the weights."""
    global _model, _scaler
    if _model is None:
        try:
            _model = _build_model_architecture()
            _model.load_weights(_WEIGHTS_PATH)
            _scaler = joblib.load(_SCALER_PATH)
            print("TensorFlow traffic model loaded successfully.")
        except Exception as e:
            print(f"Model could not be loaded, falling back to rule-based formula. Reason: {e}")
            _model = None
    return _model


def predict_congestion(vehicle_count, weather, hour):
    """
    First tries to predict using the TensorFlow model.
    If the model isn't available (or fails for any reason), falls
    back to the old rule-based formula - this way the app never crashes.
    """
    model = load_model()

    if model is not None:
        try:
            weather_num = WEATHER_TO_NUMBER.get(weather, 0)
            input_data = np.array([[vehicle_count, weather_num, hour]])
            input_scaled = _scaler.transform(input_data)
            prediction = model.predict(input_scaled, verbose=0)
            score = float(prediction[0][0])
            score = max(0.0, min(10.0, round(score, 1)))
            return score
        except Exception as e:
            print(f"Model prediction failed, switching to formula: {e}")
            # falls through to the rule-based formula below

    # ---------- Fallback: rule-based formula (same as before) ----------
    base_score = vehicle_count / 8

    weather_multiplier = {
        "Rainy": 1.35,
        "Foggy": 1.25,
        "Cloudy": 1.1,
    }.get(weather, 1.0)
    base_score *= weather_multiplier

    if hour in [8, 9, 10, 17, 18, 19]:
        base_score *= 1.2

    congestion_score = min(round(base_score, 1), 10.0)
    return congestion_score


# ==================== Everything below is exactly the same as before ====================

HOURLY_MULTIPLIER = {
    0: 0.3, 1: 0.2, 2: 0.15, 3: 0.15, 4: 0.2, 5: 0.4,
    6: 0.7, 7: 1.0, 8: 1.5, 9: 1.6, 10: 1.3, 11: 1.1,
    12: 1.2, 13: 1.2, 14: 1.1, 15: 1.1, 16: 1.2, 17: 1.5,
    18: 1.7, 19: 1.6, 20: 1.2, 21: 0.9, 22: 0.6, 23: 0.4
}

WEEKEND_MULTIPLIER = {
    0: 0.35, 1: 0.25, 2: 0.2, 3: 0.2, 4: 0.25, 5: 0.35,
    6: 0.5, 7: 0.7, 8: 0.9, 9: 1.0, 10: 1.15, 11: 1.3,
    12: 1.4, 13: 1.35, 14: 1.25, 15: 1.25, 16: 1.35, 17: 1.45,
    18: 1.5, 19: 1.4, 20: 1.25, 21: 1.0, 22: 0.7, 23: 0.45
}


def _curve_for(is_weekend):
    return WEEKEND_MULTIPLIER if is_weekend else HOURLY_MULTIPLIER


def predict_short_term(vehicle_count, weather, current_hour, current_minute=0, is_weekend=False):
    curve = _curve_for(is_weekend)

    def multiplier_at(hour_offset_minutes):
        total_minutes = current_hour * 60 + current_minute + hour_offset_minutes
        total_minutes = total_minutes % (24 * 60)
        hour = total_minutes // 60
        minute_frac = (total_minutes % 60) / 60.0
        next_hour = (hour + 1) % 24
        m1 = curve.get(hour, 1.0)
        m2 = curve.get(next_hour, 1.0)
        return m1 + (m2 - m1) * minute_frac, (hour + (1 if minute_frac >= 0.5 else 0)) % 24

    current_multiplier = curve.get(current_hour, 1.0)
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
    current_multiplier = HOURLY_MULTIPLIER.get(current_hour, 1.0)
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


def get_peak_hour_profile(vehicle_count, weather, current_hour, is_weekend=False, location_seed=None):
    curve = _curve_for(is_weekend)
    current_multiplier = curve.get(current_hour, 1.0)
    baseline_vehicles = vehicle_count / current_multiplier if current_multiplier > 0 else vehicle_count

    rng = random.Random(location_seed) if location_seed is not None else None

    profile = []
    for hour in range(24):
        base_mult = curve.get(hour, 1.0)
        wobble = 1 + (rng.random() - 0.5) * 0.24 if rng else 1.0
        multiplier = base_mult * wobble

        projected_vehicles = max(int(baseline_vehicles * multiplier), 0)
        score = predict_congestion(projected_vehicles, weather, hour)
        profile.append({
            "hour": hour,
            "projected_vehicles": projected_vehicles,
            "congestion_score": score,
            "is_current": hour == current_hour
        })

    busiest = sorted(profile, key=lambda p: p["congestion_score"], reverse=True)[:3]
    peak_hours = {p["hour"] for p in busiest}
    for p in profile:
        p["is_peak"] = p["hour"] in peak_hours

    return profile