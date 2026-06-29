import mysql.connector

def get_connection():
    conn = mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="2006",
        database="smart_traffic"
    )
    return conn