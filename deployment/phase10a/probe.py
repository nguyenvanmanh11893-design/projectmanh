"""Local active readiness probe; collected from the API log by CloudWatch Agent."""
import json
import urllib.request

try:
    with urllib.request.urlopen('http://127.0.0.1:3000/health/ready', timeout=4) as response:
        ready = int(response.status == 200 and json.load(response).get('status') == 'ready')
except Exception:
    ready = 0
print(json.dumps({'event': 'api_probe', 'ready': ready}), flush=True)
