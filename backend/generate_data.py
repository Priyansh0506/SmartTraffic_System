"""
generate_data.py

This script generates synthetic training data by running our existing
rule-based congestion formula thousands of times with random inputs.
This CSV becomes the "training dataset" for the TensorFlow model.

Basic idea: run the formula on 5000 different random situations,
save each situation's input (vehicle_count, weather, hour) and
output (congestion_score) to a CSV file.
"""

import csv
import random

# ---------- Same rule-based formula already used in the project ----------
def predict_congestion(vehicle_count, weather, hour):
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
# ------------------------------------------------------------------------

# Weather needs to be converted to a number, since a neural network
# only understands numbers, not text
WEATHER_TO_NUMBER = {
    "Clear": 0,
    "Cloudy": 1,
    "Rainy": 2,
    "Foggy": 3,
}

def generate_dataset(num_rows=5000, output_file="traffic_data.csv"):
    rows = []

    for _ in range(num_rows):
        # generate random input values
        vehicle_count = random.randint(0, 120)
        weather = random.choice(list(WEATHER_TO_NUMBER.keys()))
        hour = random.randint(0, 23)

        # adding a bit of realistic noise/randomness so the model
        # doesn't just memorize the formula exactly, but generalizes
        # a little too (real-world data always has some variation)
        noise = random.uniform(-0.3, 0.3)

        # get the target score from the actual formula
        score = predict_congestion(vehicle_count, weather, hour)
        score = max(0, min(10, round(score + noise, 1)))

        rows.append({
            "vehicle_count": vehicle_count,
            "weather": WEATHER_TO_NUMBER[weather],
            "hour": hour,
            "congestion_score": score
        })

    # save to CSV file
    with open(output_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["vehicle_count", "weather", "hour", "congestion_score"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Done! {num_rows} rows saved to {output_file}")


if __name__ == "__main__":
    generate_dataset()