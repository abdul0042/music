from http.server import BaseHTTPRequestHandler
import yt_dlp
import json
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        video_id = query.get('videoId', [None])[0]

        if not video_id:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Video ID is required'}).encode())
            return

        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            # Use Android client spoofing which is harder for YouTube to block
            'extractor_args': {'youtube': {'player_client': ['android']}},
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=False)
                url = info.get('url')
                
                if url:
                    self.send_response(302)
                    self.send_header('Location', url)
                    self.send_header('Cache-Control', 'no-cache')
                    self.end_headers()
                else:
                    raise Exception("No URL found in extract_info")
                    
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Failed to resolve stream', 'details': str(e)}).encode())
