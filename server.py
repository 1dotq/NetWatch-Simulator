#!/usr/bin/env python3
"""AETHERIS NetPilot — Static file server + cross-machine multiplayer relay"""

import json, time, threading, os, sys, random
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
SESSIONS_FILE = os.path.join(BASE_DIR, '.mp_sessions.json')

sessions = {}   # {id: {blue:[], red:[], created:float}}
lock = threading.Lock()
SESSION_TTL = 600  # 10 min

# ── Persistence ────────────────────────────────────────────────────────────────
def _save():
    try:
        with lock:
            data = {sid: {'blue': s['blue'], 'red': s['red'], 'created': s['created']}
                    for sid, s in sessions.items()}
        with open(SESSIONS_FILE, 'w') as f:
            json.dump(data, f)
    except Exception:
        pass

def _load():
    try:
        with open(SESSIONS_FILE) as f:
            data = json.load(f)
        cutoff = time.time() - SESSION_TTL
        with lock:
            for sid, s in data.items():
                if s.get('created', 0) > cutoff:
                    sessions[sid] = {'blue': s.get('blue', []), 'red': s.get('red', []),
                                     'created': s['created']}
        print(f'Loaded {len(sessions)} active session(s) from disk.', flush=True)
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass

def _cleanup():
    while True:
        time.sleep(60)
        cutoff = time.time() - SESSION_TTL
        with lock:
            dead = [k for k, v in sessions.items() if v['created'] < cutoff]
            for k in dead:
                del sessions[k]
        if dead:
            _save()

threading.Thread(target=_cleanup, daemon=True).start()


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        print(f'[{self.client_address[0]}] {fmt % args}', flush=True)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Content-Length', '0')
        self._cors()
        self.end_headers()

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'keep-alive')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(n)) if n else {}

    # ── POST ───────────────────────────────────────────────────────────────────
    def do_POST(self):
        path  = urlparse(self.path).path
        parts = [p for p in path.split('/') if p]

        # /mp/create
        if path == '/mp/create':
            chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
            sid = ''.join(random.choices(chars, k=6))
            with lock:
                sessions[sid] = {'blue': [], 'red': [], 'created': time.time()}
            _save()
            self._json({'id': sid})
            return

        if len(parts) != 3 or parts[0] != 'mp':
            self._json({'error': 'not found'}, 404); return

        sid = parts[1]

        # /mp/<id>/join
        if parts[2] == 'join':
            with lock:
                if sid not in sessions:
                    # Auto-create so stale client IDs work after restart
                    sessions[sid] = {'blue': [], 'red': [], 'created': time.time()}
                sessions[sid]['blue'].append({'type': 'PEER_JOIN', 'role': 'red'})
            _save()
            self._json({'ok': True})
            return

        # /mp/<id>/send
        if parts[2] == 'send':
            try:
                body = self._body()
            except Exception:
                self._json({'error': 'bad body'}, 400); return
            role   = body.get('role')
            msg    = body.get('msg', {})
            target = 'red' if role == 'blue' else 'blue'
            with lock:
                if sid not in sessions:
                    # Session gone (server restarted) — tell client to reconnect
                    self._json({'error': 'session_gone'}, 410); return
                sessions[sid][target].append(msg)
            _save()
            self._json({'ok': True})
            return

        self._json({'error': 'not found'}, 404)

    # ── GET ────────────────────────────────────────────────────────────────────
    def do_GET(self):
        path  = urlparse(self.path).path
        parts = [p for p in path.split('/') if p]

        # /mp/<id>/poll/<role>
        if len(parts) == 4 and parts[0] == 'mp' and parts[2] == 'poll':
            sid, role = parts[1], parts[3]
            with lock:
                if sid not in sessions:
                    # Notify client its session is gone
                    self._json({'events': [{'type': 'SESSION_GONE'}]}); return
                events = sessions[sid].get(role, [])
                sessions[sid][role] = []
            self._json({'events': events})
            return

        super().do_GET()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(BASE_DIR)
    _load()
    httpd = ThreadingHTTPServer(('', port), Handler)
    print(f'AETHERIS relay server on port {port}', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
