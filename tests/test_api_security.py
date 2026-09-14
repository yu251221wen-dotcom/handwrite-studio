from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware

from server.main import _store, app, health, sessions
from server.resource_store import ResourceError


class ApiSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        sessions.root = Path(self.temporary.name).resolve()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_health_is_safe_and_versioned(self) -> None:
        result = health()
        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["version"].startswith("3."))
        self.assertNotIn("path", result)

    def test_sessions_are_isolated(self) -> None:
        first = sessions.create(); second = sessions.create()
        state = {"schemaVersion": 3, "pages": []}
        _store(first).save_project("current", state)
        with self.assertRaises(ResourceError):
            _store(second).load_project("current")
        self.assertEqual(_store(first).load_project("current"), state)

    def test_missing_session_and_dangerous_upload_are_rejected(self) -> None:
        with self.assertRaises(HTTPException) as error:
            _store(None)
        self.assertEqual(error.exception.status_code, 401)
        session = sessions.create()
        with self.assertRaises(ResourceError):
            _store(session).save_background("payload.js", b"alert(1)", "")

    def test_cors_does_not_use_wildcard(self) -> None:
        middleware = next(item for item in app.user_middleware if item.cls is CORSMiddleware)
        origins = middleware.kwargs["allow_origins"]
        self.assertIn("http://localhost:5173", origins)
        self.assertNotIn("*", origins)


if __name__ == "__main__":
    unittest.main()
