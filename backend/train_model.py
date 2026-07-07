import pandas as pd
import numpy as np
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

data = pd.read_csv("traffic_data.csv")

X = data[["vehicle_count", "weather", "hour"]].values
y = data["congestion_score"].values

# scaling so vehicle_count (0-120) and hour (0-23) are on similar range
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
joblib.dump(scaler, "ml_model/scaler.save")

X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)

model = keras.Sequential([
    layers.Input(shape=(3,)),
    layers.Dense(16, activation="relu"),
    layers.Dense(8, activation="relu"),
    layers.Dense(1)
])

model.compile(
    optimizer="adam",
    loss="mean_squared_error",
    metrics=["mae"]
)

print("Starting training...")
history = model.fit(
    X_train, y_train,
    validation_data=(X_test, y_test),
    epochs=30,
    batch_size=32,
    verbose=1
)

loss, mae = model.evaluate(X_test, y_test, verbose=0)
print(f"\nTest results -> Average Error (MAE): {mae:.2f} (on a 0-10 scale)")

# saving only weights, not the full h5 model - full model save also
# locks in tf/keras version and loading breaks on a different version
model.save_weights("ml_model/traffic_model.weights.h5")
print("Model weights saved: ml_model/traffic_model.weights.h5")
