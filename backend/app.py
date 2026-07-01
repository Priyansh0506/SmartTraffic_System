from flask import Flask
from flask_cors import CORS
from routes.traffic import traffic_bp
from routes.predict import predict_bp
from routes.emergency import emergency_bp
from routes.demo import demo_bp
from routes.route import route_bp
from routes.peak import peak_bp

app = Flask(__name__)
CORS(app)

# register all routes
app.register_blueprint(traffic_bp)
app.register_blueprint(predict_bp)
app.register_blueprint(emergency_bp)
app.register_blueprint(demo_bp)
app.register_blueprint(route_bp)
app.register_blueprint(peak_bp)

@app.route('/')
def home():
    return "Smart Traffic Backend Running!"

if __name__ == '__main__':
    app.run(debug=True)