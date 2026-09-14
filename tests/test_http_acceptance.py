"""Real HTTP acceptance against a new API process and isolated temporary data."""
import io
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from PIL import Image


class HttpAcceptanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{cls.port}'
        cls.process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'server.main:app', '--host', '127.0.0.1', '--port', str(cls.port)],
            cwd=Path(__file__).resolve().parent.parent,
            env={**os.environ, 'UPLOAD_DIR': cls.temp.name, 'ENVIRONMENT': 'development', 'ALLOWED_ORIGINS': 'http://localhost:5173'},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                cls.request('/health')
                return
            except (URLError, OSError):
                time.sleep(.1)
        cls.process.terminate()
        raise RuntimeError('Isolated API did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)
        cls.temp.cleanup()

    @classmethod
    def request(cls, path, data=None, headers=None, method=None):
        try:
            with urlopen(Request(cls.base + path, data=data, headers=headers or {}, method=method), timeout=30) as response:
                return response.status, dict(response.headers), response.read()
        except HTTPError as error:
            return error.code, dict(error.headers), error.read()

    def session(self):
        return json.loads(self.request('/api/session', b'')[2])['sessionId']

    def multipart(self, path, files, fields=None, session=None):
        boundary = 'HandwriteAcceptanceBoundary'
        pieces = []
        for name, value in (fields or {}).items():
            pieces.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        for field, filename, media, data in files:
            pieces.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{filename}"\r\nContent-Type: {media}\r\n\r\n'.encode(), data, b'\r\n'])
        pieces.append(f'--{boundary}--\r\n'.encode())
        return self.request(path, b''.join(pieces), {'Content-Type': f'multipart/form-data; boundary={boundary}', 'X-Session-ID': session or self.session()})

    def test_health_and_exact_cors(self):
        status, headers, body = self.request('/health', headers={'Origin': 'http://localhost:5173'})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['version'], '3.1.0')
        self.assertEqual(headers.get('access-control-allow-origin'), 'http://localhost:5173')
        self.assertNotIn('access-control-allow-origin', self.request('/health', headers={'Origin': 'https://untrusted.example'})[1])

    def test_golden_and_two_patients_over_http(self):
        fixture_dir = Path(__file__).parent / 'fixtures'
        session = self.session()
        filenames = ['v2/patient-a.docx', 'v2/patient-b.docx']
        if (fixture_dir / 'cardiology-inpatient-record.docx').exists():
            filenames.insert(0, 'cardiology-inpatient-record.docx')
        for filename in filenames:
            path = fixture_dir / filename
            status, _, body = self.multipart('/api/documents/parse', [('file', path.name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', path.read_bytes())], session=session)
            self.assertEqual(status, 200, body[:300])
            result = json.loads(body)
            self.assertEqual(result['fields'], [], 'V3.1 API must not invoke deprecated field mapping')
            if filename.startswith('cardiology'):
                self.assertEqual(result['document']['rawCharacterCount'], 3657)
            else:
                text = ''.join(block['sourceText'] for block in result['document']['blocks'])
                expected = 'A-1001' if 'patient-a' in filename else 'B-2002'
                unexpected = 'B-2002' if 'patient-a' in filename else 'A-1001'
                self.assertIn(expected, text)
                self.assertNotIn(unexpected, text)

    def test_session_project_and_background_isolation(self):
        first, second = self.session(), self.session()
        state = {'schemaVersion': 3, 'pages': [{'pageId': 'page-2', 'lines': [{'manualOffsetX': 23}]}]}
        self.assertEqual(self.request('/api/projects/current', json.dumps(state).encode(), {'Content-Type': 'application/json', 'X-Session-ID': first}, 'PUT')[0], 200)
        self.assertEqual(json.loads(self.request('/api/projects/current', headers={'X-Session-ID': first})[2]), state)
        self.assertEqual(self.request('/api/projects/current', headers={'X-Session-ID': second})[0], 404)
        image = io.BytesIO(); Image.new('RGB', (100, 140), '#eeeecc').save(image, 'PNG')
        status, _, body = self.multipart('/api/backgrounds', [('file', 'paper.png', 'image/png', image.getvalue())], session=first)
        self.assertEqual(status, 200)
        resource_id = json.loads(body)['id']
        self.assertEqual(self.request(f'/api/backgrounds/{resource_id}/file?session={second}')[0], 404)
        self.assertEqual(self.request(f'/api/backgrounds/{resource_id}/file?session={first}')[0], 200)

    def test_pdf_three_pages_a4_and_unicode_filename(self):
        for width, height in [(1240, 1754), (2480, 3508)]:
            image = io.BytesIO(); Image.new('RGB', (width, height), 'white').save(image, 'PNG')
            status, headers, body = self.multipart('/api/export/pdf', [('files', f'page-{i}.png', 'image/png', image.getvalue()) for i in range(3)], {'name': '验收病历'})
            self.assertEqual(status, 200, body[:300])
            self.assertIn("filename*=UTF-8''", {key.lower(): value for key, value in headers.items()}['content-disposition'])
            self.assertEqual(len(re.findall(rb'/Type\s*/Page\b', body)), 3)
            box = re.search(rb'/MediaBox\s*\[([^\]]+)\]', body).group(1).split()
            self.assertAlmostEqual(float(box[2]), 595.276, delta=.1)
            self.assertAlmostEqual(float(box[3]), 841.89, delta=.5)

    def test_invalid_docx_rejected(self):
        status, _, _ = self.multipart('/api/documents/parse', [('file', 'broken.docx', 'application/octet-stream', b'not a zip')])
        self.assertEqual(status, 422)


if __name__ == '__main__':
    unittest.main()
