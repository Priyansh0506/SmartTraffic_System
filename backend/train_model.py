"""
train_model.py

This script reads traffic_data.csv and trains a simple neural network
that predicts congestion_score based on (vehicle_count, weather, hour).

Model is kept simple (student-level) - just 2 hidden layers, not too
complex so it's easy to understand and explain.
"""

import pandas as pd
import numpy as np
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib

# ---------- Step 1: Load the data ----------
data = pd.read_csv("traffic_data.csv")

# separate input features (X) and output (y)
X = data[["vehicle_count", "weather", "hour"]].values
y = data["congestion_score"].values

# ---------- Step 2: Scale the data ----------
# neural networks work better when inputs are on a similar scale
# (vehicle_count goes 0-120 but hour is only 0-23 - scaling evens this out)
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# saving the scaler because the same scaling needs to be applied
# again at prediction time
joblib.dump(scaler, "ml_model/scaler.save")

# ---------- Step 3: Split into train and test data ----------
# 80% of data for training, 20% for testing (to check accuracy)
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)

# ---------- Step 4: Build the model (simple neural network) ----------
model = keras.Sequential([
    layers.Input(shape=(3,)),          # 3 inputs: vehicle_count, weather, hour
    layers.Dense(16, activation="relu"),  # hidden layer 1
    layers.Dense(8, activation="relu"),   # hidden layer 2
    layers.Dense(1)                     # output: congestion score (a single number)
])

model.compile(
    optimizer="adam",
    loss="mean_squared_error",   # this is a regression problem (predicting a number), so MSE
    metrics=["mae"]              # mean absolute error - how far off the average prediction is
)

# ---------- Step 5: Train ----------
print("Starting training...")
history = model.fit(
    X_train, y_train,
    validation_data=(X_test, y_test),
    epochs=30,
    batch_size=32,
    verbose=1
)

# ---------- Step 6: Check performance on test data ----------
loss, mae = model.evaluate(X_test, y_test, verbose=0)
print(f"\nTest results -> Average Error (MAE): {mae:.2f} (on a 0-10 scale)")

# ---------- Step 7: Save the model ----------
# Saving only the WEIGHTS instead of the full model (.h5 with full
# model saving also bakes in the TensorFlow/Keras version - if your
# machine has a slightly different version, loading fails, which is
# exactly what happened before). Weights-only is version-independent
# because we define the architecture in code ourselves, and only the
# numbers (weights) come from the file.
model.save_weights("ml_model/traffic_model.weights.h5")
print("Model weights saved: ml_model/traffic_model.weights.h5")