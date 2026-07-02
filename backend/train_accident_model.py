import pandas as pd
import numpy as np
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

data = pd.read_csv("accident_prediction_india.csv")

# rough severity -> base score mapping, just picked numbers that felt right
severity_base = {
    "Minor": 3,
    "Serious": 6,
    "Fatal": 9
}
data["severity_base"] = data["Accident Severity"].map(severity_base).fillna(5)

casualty_bump = data["Number of Casualties"].clip(0, 5) * 0.3
fatality_bump = data["Number of Fatalities"].clip(0, 3) * 0.6

data["risk_score"] = (data["severity_base"] + casualty_bump + fatality_bump).clip(0, 10)

weather_map = {
    "Clear": "Clear",
    "Cloudy": "Cloudy",
    "Rainy": "Rainy",
    "Foggy": "Foggy",
    "Hazy": "Foggy",     # closest match, both = bad visibility
    "Stormy": "Rainy"    # closest match
}
data["weather_mapped"] = data["Weather Condition"].map(weather_map).fillna("Clear")

WEATHER_TO_NUMBER = {"Clear": 0, "Cloudy": 1, "Rainy": 2, "Foggy": 3}
data["weather_num"] = data["weather_mapped"].map(WEATHER_TO_NUMBER)

data["hour"] = data["Time of Day"].str.split(":").str[0].astype(int)

data["vehicle_count_scaled"] = data["Number of Vehicles Involved"] * 12

X_accidents = data[["vehicle_count_scaled", "weather_num", "hour"]].values
y_accidents = data["risk_score"].values

# ---- synthetic "safe" examples ----
# the CSV only contains rows where an accident already happened, so every
# training example had a target of at least 3 (severity_base). the model
# never saw a genuinely low-risk situation, so it learned to always predict
# high regardless of input. we fix that by generating plausible "nothing
# went wrong" traffic scenarios and giving them low target scores, so the
# model has something to contrast against.
rng = np.random.default_rng(42)
N_SAFE = len(data) * 2  # give the model more contrast examples to learn from

safe_hour = rng.integers(0, 24, N_SAFE)
safe_weather_num = rng.choice([0, 1, 2, 3], size=N_SAFE, p=[0.55, 0.25, 0.15, 0.05])
# widened to 150 to cover the live app's real vehicle_count range
# (BASE_VEHICLES=35 * time_multiplier * congestion_factor can reach ~120+)
safe_vehicle_scaled = rng.uniform(5, 150, N_SAFE)

is_peak = np.isin(safe_hour, [8, 9, 17, 18, 19])
is_night = (safe_hour >= 22) | (safe_hour <= 4)
traffic_load = safe_vehicle_scaled / 150.0  # 0-1, more vehicles = more exposure

# mostly low risk (0-3) at low load, but scales up with vehicle load so the
# model actually learns "more traffic + bad weather + peak = higher risk"
# instead of only ever seeing low-traffic "safe" examples
safe_risk = (
    rng.uniform(0.2, 1.5, N_SAFE)
    + traffic_load * rng.uniform(2.0, 4.0, N_SAFE)
    + is_peak * rng.uniform(0.3, 1.2, N_SAFE)
    + is_night * rng.uniform(0.3, 1.0, N_SAFE)
    + (safe_weather_num >= 2) * rng.uniform(0.3, 1.5, N_SAFE)
)
safe_risk = np.clip(safe_risk, 0, 7.5)

X_safe = np.column_stack([safe_vehicle_scaled, safe_weather_num, safe_hour])
y_safe = safe_risk

X = np.vstack([X_accidents, X_safe])
y = np.concatenate([y_accidents, y_safe])

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
joblib.dump(scaler, "ml_model/accident_scaler.save")

X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)

model = keras.Sequential([
    layers.Input(shape=(3,)),
    layers.Dense(16, activation="relu"),
    layers.Dense(8, activation="relu"),
    layers.Dense(1)
])

model.compile(optimizer="adam", loss="mean_squared_error", metrics=["mae"])

print("training accident model...")
model.fit(
    X_train, y_train,
    validation_data=(X_test, y_test),
    epochs=30,
    batch_size=32,
    verbose=1
)

loss, mae = model.evaluate(X_test, y_test, verbose=0)
print(f"\ndone. avg error (mae): {mae:.2f} out of 10")

model.save_weights("ml_model/accident_model.weights.h5")
print("saved weights to ml_model/accident_model.weights.h5")