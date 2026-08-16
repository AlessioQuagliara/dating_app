import os
from datetime import date, datetime, timezone
from functools import wraps

from flask import Flask, Response, flash, jsonify, redirect, render_template, request, session, url_for

from db import get_db, init_db

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-insecure-change-me")

init_db()

CONTROLLI_PASSWORD = os.environ.get("CONTROLLI_PASSWORD", "bubu123")

ACTIVITIES = [
    {"slug": "cena", "name": "Cena romantica", "icon": "ri-restaurant-2-line", "options": ["Sushi", "Pizza", "Altro"]},
    {"slug": "cinema", "name": "Cinema", "icon": "ri-film-line", "options": ["Commedia", "Horror", "Romantico", "Azione"]},
    {"slug": "aperitivo", "name": "Aperitivo", "icon": "ri-goblet-line", "options": ["Città", "Lago"]},
    {"slug": "weekend", "name": "Weekend fuori", "icon": "ri-suitcase-3-line", "options": ["Mare", "Montagna", "Città d'arte"]},
    {"slug": "shopping", "name": "Shopping", "icon": "ri-shopping-bag-3-line", "options": ["Vestiti", "Scarpe", "Regali"]},
    {"slug": "relax", "name": "Serata a casa", "icon": "ri-sofa-line", "options": ["Cibo d'asporto", "Cucina a casa"]},
]

MOODS = [
    {"label": "Innamorato", "image": "love_hedgehog.png"},
    {"label": "Felice", "image": "hedgehog.png"},
    {"label": "Stanco", "image": "tired_hedgehog.png"},
    {"label": "Annoiato", "image": "tired_hedgehog.png"},
    {"label": "Stressato", "image": "sad_hedgehog.png"},
    {"label": "Arrabbiato", "image": "angry_hedgehog.png"},
]


def mood_image_for(label):
    for m in MOODS:
        if m["label"] == label:
            return m["image"]
    return "hedgehog.png"

MESI_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
           "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]


def format_date_it(iso_date):
    y, m, d = iso_date.split("-")
    return f"{int(d)} {MESI_IT[int(m) - 1]} {y}"


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("controlli_ok"):
            return redirect(url_for("controlli"))
        return view(*args, **kwargs)
    return wrapped


@app.after_request
def add_robots_header(response):
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    return response


@app.route("/robots.txt")
def robots_txt():
    return Response("User-agent: *\nDisallow: /\n", mimetype="text/plain")


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/appuntamenti")
def appuntamenti():
    conn = get_db()
    rows = conn.execute("SELECT * FROM events ORDER BY event_date ASC").fetchall()
    conn.close()

    today = date.today().isoformat()
    events = []
    for row in rows:
        events.append({
            "id": row["id"],
            "activity": row["activity"],
            "icon": row["icon"],
            "event_date": row["event_date"],
            "event_date_it": format_date_it(row["event_date"]),
            "is_past": row["event_date"] < today,
        })

    return render_template("appuntamenti.html", events=events)


@app.route("/api/eventi", methods=["POST"])
def crea_evento():
    data = request.get_json(silent=True) or {}
    activity = (data.get("activity") or "").strip()
    icon = (data.get("icon") or "").strip()
    event_date = (data.get("event_date") or "").strip()

    if not activity or not icon or not event_date:
        return jsonify({"error": "Dati mancanti"}), 400

    try:
        datetime.strptime(event_date, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "Data non valida"}), 400

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO events (activity, icon, event_date) VALUES (?, ?, ?)",
        (activity, icon, event_date),
    )
    conn.commit()
    event_id = cur.lastrowid
    conn.close()

    return jsonify({"id": event_id, "ok": True}), 201


@app.route("/api/eventi/<int:event_id>/ics")
def scarica_ics(event_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    conn.close()

    if row is None:
        return jsonify({"error": "Evento non trovato"}), 404

    dt_compact = row["event_date"].replace("-", "")
    dt_stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ics = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//Bubapp//Appuntamenti//IT\r\n"
        "CALSCALE:GREGORIAN\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:bubapp-{row['id']}@bubapp.local\r\n"
        f"DTSTAMP:{dt_stamp}\r\n"
        f"DTSTART;VALUE=DATE:{dt_compact}\r\n"
        f"SUMMARY:{row['activity']}\r\n"
        "DESCRIPTION:Appuntamento con Bubu 🦔\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )

    return Response(
        ics,
        mimetype="text/calendar",
        headers={"Content-Disposition": f"attachment; filename=appuntamento-{row['id']}.ics"},
    )


@app.route("/api/eventi/<int:event_id>", methods=["DELETE"])
def elimina_evento(event_id):
    conn = get_db()
    cur = conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()

    if cur.rowcount == 0:
        return jsonify({"error": "Evento non trovato"}), 404

    return jsonify({"ok": True})


@app.route("/stato")
def stato():
    conn = get_db()
    mood = conn.execute("SELECT * FROM mood ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    mood_image = mood_image_for(mood["label"]) if mood else "hedgehog.png"
    return render_template("stato.html", mood=mood, mood_image=mood_image)


@app.route("/controlli", methods=["GET", "POST"])
def controlli():
    if request.method == "POST" and not session.get("controlli_ok"):
        if request.form.get("password") == CONTROLLI_PASSWORD:
            session["controlli_ok"] = True
        else:
            flash("Password errata", "error")
        return redirect(url_for("controlli"))

    if not session.get("controlli_ok"):
        return render_template("controllo.html", authenticated=False)

    conn = get_db()
    mood = conn.execute("SELECT * FROM mood ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return render_template("controllo.html", authenticated=True, mood=mood, moods=MOODS)


@app.route("/controlli/aggiorna", methods=["POST"])
@login_required
def aggiorna_stato():
    percentage = request.form.get("percentage", type=int)
    label = (request.form.get("label") or "").strip()
    valid_labels = {m["label"] for m in MOODS}

    if percentage is None or not (0 <= percentage <= 100) or label not in valid_labels:
        flash("Dati non validi", "error")
        return redirect(url_for("controlli"))

    conn = get_db()
    conn.execute("INSERT INTO mood (percentage, label) VALUES (?, ?)", (percentage, label))
    conn.commit()
    conn.close()

    flash("Stato del riccio aggiornato!", "success")
    return redirect(url_for("controlli"))


@app.route("/controlli/logout")
def logout_controlli():
    session.pop("controlli_ok", None)
    return redirect(url_for("controlli"))


@app.context_processor
def inject_globals():
    return {"activities": ACTIVITIES}


if __name__ == "__main__":
    app.run(debug=True, port=3020, host="0.0.0.0")
