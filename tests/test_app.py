import unittest
from pathlib import Path
from unittest.mock import patch

from service.app import (
    Job,
    JobManager,
    format_prefix,
    is_extension_origin,
    normalize_youtube_url,
    sanitize_folder_name,
    to_alphabet,
    to_roman,
    validate_download_request,
)


class YoutubeUrlTests(unittest.TestCase):
    def test_normalizes_supported_urls(self):
        cases = {
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3": "dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?si=abc": "dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ": "dQw4w9WgXcQ",
            "https://m.youtube.com/live/dQw4w9WgXcQ": "dQw4w9WgXcQ",
        }
        for source, video_id in cases.items():
            with self.subTest(source=source):
                self.assertEqual(
                    normalize_youtube_url(source),
                    f"https://www.youtube.com/watch?v={video_id}",
                )

    def test_normalizes_playlist_urls(self):
        playlist_cases = {
            "https://www.youtube.com/playlist?list=PLBCF2DAC6FFB574DE": "PLBCF2DAC6FFB574DE",
            "https://m.youtube.com/playlist?list=PLr6-GrHUlVf_kO47V-wJ-tQeP5yX8aB2": "PLr6-GrHUlVf_kO47V-wJ-tQeP5yX8aB2",
        }
        for source, playlist_id in playlist_cases.items():
            with self.subTest(source=source):
                self.assertEqual(
                    normalize_youtube_url(source),
                    f"https://www.youtube.com/playlist?list={playlist_id}",
                )

    def test_rejects_non_youtube_and_lookalike_hosts(self):
        bad_urls = [
            "https://example.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
            "http://youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/playlist?list=123456789",
            "javascript:alert(1)",
        ]
        for value in bad_urls:
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_youtube_url(value)


class RequestValidationTests(unittest.TestCase):
    def setUp(self):
        self.valid = {
            "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
            "kind": "video",
            "quality": "720",
        }

    def test_accepts_valid_request(self):
        result = validate_download_request(self.valid)
        self.assertEqual(result["kind"], "video")
        self.assertEqual(result["quality"], "720")

    def test_rejects_unknown_format_values(self):
        for field, value in (("kind", "playlist"), ("quality", "8k; rm -rf")):
            request = {**self.valid, field: value}
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_download_request(request)


class OriginTests(unittest.TestCase):
    def test_accepts_chromium_extension_id(self):
        self.assertTrue(is_extension_origin("chrome-extension://abcdefghijklmnopabcdefghijklmnop"))

    def test_rejects_web_and_malformed_origins(self):
        for origin in (None, "null", "https://youtube.com", "chrome-extension://short"):
            with self.subTest(origin=origin):
                self.assertFalse(is_extension_origin(origin))


class CommandTests(unittest.TestCase):
    def test_command_is_argument_list_and_disables_playlists(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        job = Job(
            id="1",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            kind="video",
            quality="1080",
        )
        command = manager._command(job)
        self.assertIsInstance(command, list)
        self.assertIn("--no-playlist", command)
        self.assertEqual(command[-1], job.url)
        self.assertNotIn("shell", command)

    def test_command_supports_player_client_and_cookies(self):
        manager = JobManager(
            Path("/tmp/okja-test"),
            "yt-dlp",
            player_client="android,web",
            cookies_from_browser="chrome",
        )
        job = Job(
            id="1",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            kind="video",
            quality="1080",
        )
        command = manager._command(job)
        self.assertIn("youtube:player_client=android,web", command)
        self.assertIn("--cookies-from-browser", command)
        self.assertIn("chrome", command)

    def test_audio_command_requests_mp3(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        job = Job(
            id="2",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            kind="audio",
            quality="best",
        )
        command = manager._command(job)
        self.assertIn("--extract-audio", command)
        self.assertEqual(command[command.index("--audio-format") + 1], "mp3")

    def test_video_command_requests_mp4(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        job = Job(
            id="1",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            kind="video",
            quality="1080",
        )
        command = manager._command(job)
        self.assertIn("--merge-output-format", command)
        self.assertEqual(command[command.index("--merge-output-format") + 1], "mp4")
        self.assertIn("--remux-video", command)
        self.assertEqual(command[command.index("--remux-video") + 1], "mp4")

    def test_playlist_command_enables_playlist_and_ignores_errors(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        job = Job(
            id="3",
            url="https://www.youtube.com/playlist?list=PLBCF2DAC6FFB574DE",
            kind="video",
            quality="1080",
            is_playlist=True,
        )
        command = manager._command(job)
        self.assertIn("--yes-playlist", command)
        self.assertIn("--ignore-errors", command)
        self.assertNotIn("--no-playlist", command)
        self.assertEqual(command[-1], job.url)


class QueueTests(unittest.TestCase):
    def test_queue_ordering_and_summary(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        manager._active_job_id = "active-1"
        active_job = Job(id="active-1", url="https://youtube.com/watch?v=dQw4w9WgXcQ", kind="video", quality="720", status="downloading")
        manager._jobs["active-1"] = active_job

        queued_job = manager.create({
            "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
            "kind": "audio",
            "quality": "best",
            "title": "Queued Audio",
        })
        self.assertEqual(queued_job.status, "queued")
        self.assertEqual(manager._queue, [queued_job.id])

        summary = manager.status_summary()
        self.assertEqual(summary["queueCount"], 1)
        self.assertEqual(summary["activeJob"]["id"], "active-1")
        self.assertEqual(summary["queue"][0]["title"], "Queued Audio")


class PrefixAndFolderTests(unittest.TestCase):
    def test_roman_numerals(self):
        cases = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 9: "IX", 10: "X", 14: "XIV", 20: "XX", 40: "XL"}
        for n, expected in cases.items():
            self.assertEqual(to_roman(n), expected)

    def test_alphabet(self):
        cases = {1: "A", 2: "B", 26: "Z", 27: "AA", 28: "AB"}
        for n, expected in cases.items():
            self.assertEqual(to_alphabet(n), expected)

    def test_format_prefix(self):
        self.assertEqual(format_prefix("number", 1), "01 - ")
        self.assertEqual(format_prefix("number", 15), "15 - ")
        self.assertEqual(format_prefix("roman", 4), "IV - ")
        self.assertEqual(format_prefix("alphabet", 3), "C - ")
        self.assertEqual(format_prefix("custom", 2, "Part {num} - "), "Part 02 - ")
        self.assertEqual(format_prefix("custom", 5, "Episode {index}: "), "Episode 5: ")
        self.assertEqual(format_prefix("custom", 1, "Track"), "Track - ")
        self.assertEqual(format_prefix("none", 1), "")

    def test_sanitize_folder_name(self):
        self.assertEqual(sanitize_folder_name("My: Playlist / Best? Videos *"), "My_ Playlist _ Best_ Videos _")
        self.assertEqual(sanitize_folder_name("   "), "Playlist")


class PlaylistQueueTests(unittest.TestCase):
    @patch("service.app.extract_playlist_items")
    def test_playlist_expands_to_active_and_queue(self, mock_extract):
        mock_extract.return_value = (
            "Python Course",
            [
                {"id": "v1", "title": "Intro", "url": "https://www.youtube.com/watch?v=11111111111"},
                {"id": "v2", "title": "Variables", "url": "https://www.youtube.com/watch?v=22222222222"},
                {"id": "v3", "title": "Functions", "url": "https://www.youtube.com/watch?v=33333333333"},
            ],
        )

        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        # Prevent actually spawning subprocess in tests
        with patch.object(manager, "_run"):
            jobs = manager.create_playlist({
                "url": "https://www.youtube.com/playlist?list=PLBCF2DAC6FFB574DE",
                "kind": "video",
                "quality": "1080",
                "prefix_type": "number",
                "folder": "My Python Course",
            })

            self.assertEqual(len(jobs), 3)
            # First job is active
            self.assertEqual(manager._active_job_id, jobs[0].id)
            self.assertEqual(jobs[0].file_prefix, "01 - ")
            self.assertEqual(jobs[0].subfolder, "My Python Course")
            self.assertFalse(jobs[0].is_playlist)

            # Rest are queued
            self.assertEqual(manager._queue, [jobs[1].id, jobs[2].id])
            self.assertEqual(jobs[1].status, "queued")
            self.assertEqual(jobs[1].file_prefix, "02 - ")
            self.assertEqual(jobs[1].subfolder, "My Python Course")

            self.assertEqual(jobs[2].status, "queued")
            self.assertEqual(jobs[2].file_prefix, "03 - ")

            summary = manager.status_summary()
            self.assertEqual(summary["activeJob"]["id"], jobs[0].id)
            self.assertEqual(summary["queueCount"], 2)
            self.assertEqual(summary["queue"][0]["file_prefix"], "02 - ")


if __name__ == "__main__":
    unittest.main()
