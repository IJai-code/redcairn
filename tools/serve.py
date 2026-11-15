#!/usr/bin/env python3
"""Serve the app locally: python3 tools/serve.py [port]"""
import functools
import http.server
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

class NoCache(http.server.SimpleHTTPRequestHandler):
    """Never let the browser keep an old module while we edit."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


handler = functools.partial(NoCache, directory=ROOT)
with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
    print("REDCAIRN at http://localhost:%d" % PORT)
    httpd.serve_forever()
