"""
Barrierefreier Stundenplan & Prüfungen - LWL-Berufskolleg Soest
Lokaler Server & WebUntis-API-Bridge (umgeht Browser-CORS)
"""

import http.server
import json
import os
import sys
import urllib.error
import urllib.request
import webbrowser

PORT = 48250
if getattr(sys, 'frozen', False):
    DIRECTORY = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    DIRECTORY = os.path.dirname(os.path.abspath(__file__))
WEBUNTIS_URL = "https://lwl-bk-soest.webuntis.com/WebUntis/jsonrpc.do?school=lwl-bk-soest"

class BridgeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == '/api/canteen' or self.path.startswith('/api/canteen?'):
            canteen_path = os.path.join(DIRECTORY, 'canteen_seed.json')
            if os.path.isfile(canteen_path):
                with open(canteen_path, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
                return
            else:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"source":"LWL-Mensa","weeks":[]}')
                return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/webuntis'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            target_url = WEBUNTIS_URL
            school_header = self.headers.get('X-School')
            server_header = self.headers.get('X-Server')
            if school_header and server_header:
                target_url = f"https://{server_header}/WebUntis/jsonrpc.do?school={school_header}"

            session_id = self.headers.get('X-JSESSIONID')
            headers = {'Content-Type': 'application/json'}
            if session_id:
                headers['Cookie'] = f"JSESSIONID={session_id}"
                srv = server_header or "lwl-bk-soest.webuntis.com"
                sch = school_header or "lwl-bk-soest"
                target_url = f"https://{srv}/WebUntis/jsonrpc.do;jsessionid={session_id}?school={sch}"

            try:
                req = urllib.request.Request(target_url, data=post_data, headers=headers)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    resp_data = resp.read()
                    set_cookie = resp.headers.get('Set-Cookie', '')
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    if set_cookie:
                        self.send_header('X-Set-Cookie', set_cookie)
                    self.end_headers()
                    self.wfile.write(resp_data)
            except urllib.error.HTTPError as e:
                err_data = e.read()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(err_data)
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                err_resp = json.dumps({'jsonrpc': '2.0', 'id': 'err', 'error': {'message': str(ex), 'code': -1}}).encode()
                self.wfile.write(err_resp)
        else:
            self.send_error(404, "Endpoint not found")

def main():
    os.chdir(DIRECTORY)
    server_address = ('127.0.0.1', PORT)
    httpd = http.server.HTTPServer(server_address, BridgeHandler)
    print(f"================================================================")
    print(f" Barrierefreier Stundenplan - LWL-Berufskolleg Soest Server")
    print(f" Lokale Bridge aktiv auf: http://127.0.0.1:{PORT}")
    print(f" WebUntis-Ziel: {WEBUNTIS_URL}")
    print(f"================================================================")
    print("Oeffne Web-App im Browser...")
    webbrowser.open(f"http://127.0.0.1:{PORT}/index.html")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer wird beendet.")
        httpd.server_close()

if __name__ == '__main__':
    main()
