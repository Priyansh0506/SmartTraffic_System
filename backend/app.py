from flask import Flask
from flask_cors import CORS
from routes.traffic import traffic_bp
from routes.predict import predict_bp
from routes.emergency import emergency_bp
from routes.demo import demo_bp
from routes.route import route_bp
from routes.peak import peak_bp
from routes.accident import accident_bp
from routes.geocode import geocode_bp
from routes.ingest import ingest_bp


app = Flask(__name__)
CORS(app)

# register all routes
app.register_blueprint(traffic_bp)
app.register_blueprint(predict_bp)
app.register_blueprint(emergency_bp)
app.register_blueprint(demo_bp)
app.register_blueprint(route_bp)
app.register_blueprint(peak_bp)
app.register_blueprint(accident_bp)
app.register_blueprint(geocode_bp) 
app.register_blueprint(ingest_bp)

@app.route('/')
def home():
    return "Smart Traffic Backend Running!"

if __name__ == '__main__':
    # use_reloader=False because the reloader would restart the server
    # mid-request the first time TensorFlow lazy-loads (it sees new
    # module files show up and thinks that's a code change). just
    # restart manually when you actually edit something.
    app.run(debug=True, use_reloader=False)