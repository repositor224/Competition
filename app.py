"""Local web dashboard and JSON API for synthetic campus safety scenarios."""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from src.scenarios import load_scenario
from src.detector import analyze

WEB_DIR = Path(__file__).parent / "web"


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        if url.path != "/api/scenario":
            return super().do_GET()
        name = parse_qs(url.query).get("name", ["normal"])[0]
        try:
            df = load_scenario(name)
            payload = {"name": name, "readings": json.loads(df.to_json(orient="records")),
                       "assessment": analyze(df)}
            self.send_json(200, payload)
        except ValueError:
            self.send_json(400, {"error": "Choose one of the available scenarios."})
        except Exception:
            self.log_error("Unable to load scenario %s", name)
            self.send_json(500, {"error": "Unable to load sensor data. Try again."})

    def send_json(self, status, payload):
        body = json.dumps(payload, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(DashboardHandler, directory=str(WEB_DIR)))
    print(f"Campus Safety: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
