import tempfile
import threading
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

    def test_accepts_video_resolutions_including_4k_and_2k(self):
        for qual in ("best", "2160", "1440", "1080", "720", "480", "360"):
            req = {**self.valid, "quality": qual}
            res = validate_download_request(req)
            self.assertEqual(res["quality"], qual)

    def test_accepts_audio_bitrates(self):
        for bitrate in ("best", "320", "256", "192", "128"):
            req = {**self.valid, "kind": "audio", "quality": bitrate}
            res = validate_download_request(req)
            self.assertEqual(res["kind"], "audio")
            self.assertEqual(res["quality"], bitrate)

    def test_rejects_invalid_audio_quality(self):
        req = {**self.valid, "kind": "audio", "quality": "9999"}
        with self.assertRaises(ValueError):
            validate_download_request(req)

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
        self.assertEqual(command[command.index("--audio-quality") + 1], "0")

    def test_audio_command_respects_bitrates(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        for quality_val, expected_flag in (("320", "320k"), ("256", "256k"), ("192", "192k"), ("128", "128k")):
            job = Job(
                id="2",
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                kind="audio",
                quality=quality_val,
            )
            command = manager._command(job)
            self.assertEqual(command[command.index("--audio-quality") + 1], expected_flag)

    def test_video_command_supports_4k(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        job = Job(
            id="1",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            kind="video",
            quality="2160",
        )
        command = manager._command(job)
        self.assertEqual(command[command.index("--format") + 1], "bv*[height<=2160]+ba/b[height<=2160]")

    def test_video_command_requests_mp4(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        job = Job(
            id="1",
            url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            kind="video",
            quality="1080",
            channels=16,
        )
        command = manager._command(job)
        self.assertIn("--merge-output-format", command)
        self.assertEqual(command[command.index("--merge-output-format") + 1], "mp4")
        self.assertIn("--remux-video", command)
        self.assertEqual(command[command.index("--remux-video") + 1], "mp4")
        self.assertIn("--concurrent-fragments", command)
        self.assertEqual(command[command.index("--concurrent-fragments") + 1], "16")
        self.assertIn("--buffer-size", command)
        self.assertEqual(command[command.index("--buffer-size") + 1], "16M")
        self.assertIn("--http-chunk-size", command)
        self.assertEqual(command[command.index("--http-chunk-size") + 1], "10M")

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


class CancelCleanupTests(unittest.TestCase):
    def test_is_partial_or_temp_file(self):
        from service.app import is_partial_or_temp_file

        # Broken, incomplete, or temporary files must return True
        self.assertTrue(is_partial_or_temp_file("video.mp4.part"))
        self.assertTrue(is_partial_or_temp_file("video.mp4.ytdl"))
        self.assertTrue(is_partial_or_temp_file("video.part"))
        self.assertTrue(is_partial_or_temp_file("video.ytdl"))
        self.assertTrue(is_partial_or_temp_file("video.temp"))
        self.assertTrue(is_partial_or_temp_file("video.temp.mp4"))
        self.assertTrue(is_partial_or_temp_file("video.part-Frag1"))
        self.assertTrue(is_partial_or_temp_file("video.f137.mp4"))
        self.assertTrue(is_partial_or_temp_file("video.f248.webm"))
        self.assertTrue(is_partial_or_temp_file("video.f140.m4a"))
        self.assertTrue(is_partial_or_temp_file(Path("/path/to/download.mp4.part")))

        # Completed, valid media files must return False (preserved!)
        self.assertFalse(is_partial_or_temp_file("Never Gonna Give You Up [dQw4w9WgXcQ].mp4"))
        self.assertFalse(is_partial_or_temp_file("Never Gonna Give You Up [dQw4w9WgXcQ].mp3"))
        self.assertFalse(is_partial_or_temp_file("audio.m4a"))
        self.assertFalse(is_partial_or_temp_file("clip.webm"))
        self.assertFalse(is_partial_or_temp_file("movie.mkv"))
        self.assertFalse(is_partial_or_temp_file(Path("/downloads/final.mp4")))

    def test_cancel_removes_partial_and_preserves_completed_files(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            download_dir = Path(tmp_dir)
            manager = JobManager(download_dir, "yt-dlp")

            job = Job(
                id="test-job-1",
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                kind="video",
                quality="1080",
                title="Never Gonna Give You Up",
                status="downloading",
            )
            manager._jobs[job.id] = job
            manager._active_job_id = job.id

            part_file = download_dir / "Never Gonna Give You Up [dQw4w9WgXcQ].mp4.part"
            ytdl_file = download_dir / "Never Gonna Give You Up [dQw4w9WgXcQ].mp4.ytdl"
            temp_frag = download_dir / "Never Gonna Give You Up [dQw4w9WgXcQ].f137.mp4.part"
            unmerged_stream = download_dir / "Never Gonna Give You Up [dQw4w9WgXcQ].f137.mp4"
            final_file = download_dir / "Never Gonna Give You Up [dQw4w9WgXcQ].mp4"

            part_file.write_text("partial data")
            ytdl_file.write_text("ytdl state")
            temp_frag.write_text("fragment data")
            unmerged_stream.write_text("unmerged stream")
            final_file.write_text("completed file")

            self.assertTrue(part_file.exists())
            self.assertTrue(ytdl_file.exists())
            self.assertTrue(temp_frag.exists())
            self.assertTrue(unmerged_stream.exists())
            self.assertTrue(final_file.exists())

            cancelled = manager.cancel(job.id)
            self.assertIsNotNone(cancelled)
            self.assertEqual(cancelled.status, "cancelled")

            # Incomplete partial / broken files must be deleted
            self.assertFalse(part_file.exists())
            self.assertFalse(ytdl_file.exists())
            self.assertFalse(temp_frag.exists())
            self.assertFalse(unmerged_stream.exists())

            # Completed video file MUST be kept intact
            self.assertTrue(final_file.exists())

    def test_cancel_removes_files_in_playlist_subfolder_and_cleans_empty_dir(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            download_dir = Path(tmp_dir)
            manager = JobManager(download_dir, "yt-dlp")

            job = Job(
                id="test-playlist-job",
                url="https://www.youtube.com/watch?v=k1b2c3d4e5f",
                kind="video",
                quality="720",
                subfolder="My Course",
                status="downloading",
            )
            manager._jobs[job.id] = job
            manager._active_job_id = job.id

            course_dir = download_dir / "My Course"
            course_dir.mkdir(parents=True, exist_ok=True)
            video_file = course_dir / "01 - Lesson 1 [k1b2c3d4e5f].mp4.part"
            video_file.write_text("video chunks")

            self.assertTrue(video_file.exists())

            manager.cancel(job.id)

            self.assertFalse(video_file.exists())
            self.assertFalse(course_dir.exists())

    def test_cancel_preserves_other_completed_files_in_playlist_subfolder(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            download_dir = Path(tmp_dir)
            manager = JobManager(download_dir, "yt-dlp")

            job = Job(
                id="test-playlist-job-2",
                url="https://www.youtube.com/watch?v=k1b2c3d4e5f",
                kind="video",
                quality="720",
                subfolder="My Course",
                status="downloading",
            )
            manager._jobs[job.id] = job
            manager._active_job_id = job.id

            course_dir = download_dir / "My Course"
            course_dir.mkdir(parents=True, exist_ok=True)
            # One completed lesson and one partial lesson
            completed_lesson = course_dir / "01 - Intro [abc12345678].mp4"
            completed_lesson.write_text("full video")
            broken_lesson = course_dir / "02 - Lesson 2 [k1b2c3d4e5f].mp4.part"
            broken_lesson.write_text("broken video")

            manager.cancel(job.id)

            self.assertFalse(broken_lesson.exists())
            # Completed lesson and folder must remain
            self.assertTrue(completed_lesson.exists())
            self.assertTrue(course_dir.exists())

    def test_cancel_removes_known_filename_temp_and_preserves_completed(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            download_dir = Path(tmp_dir)
            manager = JobManager(download_dir, "yt-dlp")

            final_path = download_dir / "Custom Download.mp3"
            final_path.write_text("audio data")
            temp_path = download_dir / "Custom Download.mp3.part"
            temp_path.write_text("partial data")

            job = Job(
                id="test-filename-job",
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                kind="audio",
                quality="best",
                filename=str(final_path),
                status="downloading",
            )
            manager._jobs[job.id] = job

            manager.cancel(job.id)

            # Broken .part file deleted
            self.assertFalse(temp_path.exists())
            # Completed file preserved
            self.assertTrue(final_path.exists())


class ShutdownAndIdleTests(unittest.TestCase):
    def test_idle_timeout_triggers_shutdown_when_empty(self):
        called = threading.Event()
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp", idle_timeout=1)
        manager.set_shutdown_callback(lambda: called.set())
        self.assertTrue(called.wait(timeout=2.0))

    def test_idle_timeout_does_not_trigger_while_active_job(self):
        called = threading.Event()
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp", idle_timeout=1)
        manager.set_shutdown_callback(lambda: called.set())
        job = Job(id="active-1", url="https://youtube.com/watch?v=dQw4w9WgXcQ", kind="video", quality="720")
        with manager._lock:
            manager._jobs[job.id] = job
            manager._active_job_id = job.id
            manager._cancel_idle_timer()
        self.assertFalse(called.wait(timeout=1.5))

    def test_idle_timeout_arms_when_queue_completes(self):
        called = threading.Event()
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp", idle_timeout=1)
        manager.set_shutdown_callback(lambda: called.set())
        manager._cancel_idle_timer()
        manager._next_job()
        self.assertTrue(called.wait(timeout=2.0))


class HealthDiagnosticsTests(unittest.TestCase):
    def test_status_summary_fields(self):
        manager = JobManager(Path("/tmp/okja-test"), "yt-dlp")
        summary = manager.status_summary()
        self.assertIn("activeJob", summary)
        self.assertIn("queue", summary)
        self.assertIn("queueCount", summary)
        self.assertEqual(summary["queueCount"], 0)

    def test_distro_detection_fields(self):
        from service.distro import detect_distro
        info = detect_distro()
        self.assertIn("os", info)
        self.assertIn("name", info)
        self.assertIn("family", info)
        self.assertIn("pkg_mgr", info)
        self.assertIn("install_cmd", info)

    def test_fedora_distro_detection(self):
        import unittest.mock as mock
        from service.distro import detect_distro

        # Test Fedora via /etc/os-release ID=fedora
        fake_os_release = 'NAME="Fedora Linux"\nVERSION="41 (Workstation Edition)"\nID=fedora\nPRETTY_NAME="Fedora Linux 41"\n'
        with mock.patch("sys.platform", "linux"):
            with mock.patch("os.path.isfile", side_effect=lambda p: p in {"/etc/os-release"}):
                with mock.patch("builtins.open", mock.mock_open(read_data=fake_os_release)):
                    with mock.patch("shutil.which", return_value="/usr/bin/dnf"):
                        info = detect_distro()
                        self.assertEqual(info["os"], "linux")
                        self.assertEqual(info["family"], "fedora")
                        self.assertIn("dnf", info["pkg_mgr"])
                        self.assertIn("sudo dnf", info["install_cmd"])
                        self.assertNotIn("apt", info["install_cmd"])

        # Test Fedora derivative with ID_LIKE=fedora
        fake_nobara = 'NAME="Nobara Linux"\nID=nobara\nID_LIKE="rhel fedora"\nPRETTY_NAME="Nobara Linux 40"\n'
        with mock.patch("sys.platform", "linux"):
            with mock.patch("os.path.isfile", side_effect=lambda p: p in {"/etc/os-release"}):
                with mock.patch("builtins.open", mock.mock_open(read_data=fake_nobara)):
                    with mock.patch("shutil.which", return_value="/usr/bin/dnf"):
                        info = detect_distro()
                        self.assertEqual(info["family"], "fedora")
                        self.assertIn("sudo dnf", info["install_cmd"])
                        self.assertNotIn("apt", info["install_cmd"])

        # Test legacy /etc/fedora-release file presence
        with mock.patch("sys.platform", "linux"):
            with mock.patch("os.path.isfile", side_effect=lambda p: p in {"/etc/fedora-release"}):
                with mock.patch("builtins.open", mock.mock_open(read_data="Fedora release 41 (Workstation Edition)")):
                    with mock.patch("shutil.which", return_value="/usr/bin/dnf"):
                        info = detect_distro()
                        self.assertEqual(info["family"], "fedora")
                        self.assertNotIn("apt", info["install_cmd"])


class CacheAndDeduplicationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.manager = JobManager(Path(self.temp_dir.name), "yt-dlp")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_cache_deduplication_allows_different_format(self):
        # Cache video as 'video'
        self.manager.add_to_cache("dQw4w9WgXcQ", "video", "Never Gonna Give You Up")
        self.assertTrue(self.manager.is_cached("dQw4w9WgXcQ", "video"))
        self.assertFalse(self.manager.is_cached("dQw4w9WgXcQ", "audio"))

        # Re-requesting 'video' must raise ValueError
        with self.assertRaises(ValueError) as ctx:
            self.manager.create({
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "kind": "video",
                "quality": "1080",
            })
        self.assertIn("already downloaded", str(ctx.exception))

        # Re-requesting 'audio' MUST SUCCEED (not cached yet)
        with patch.object(self.manager, "_run"):
            audio_job = self.manager.create({
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "kind": "audio",
                "quality": "320",
            })
            self.assertEqual(audio_job.kind, "audio")

    def test_active_and_queue_deduplication(self):
        with patch.object(self.manager, "_run"):
            # Start job 1
            job1 = self.manager.create({
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "kind": "video",
                "quality": "1080",
            })
            self.assertEqual(self.manager._active_job_id, job1.id)

            # Attempting to queue the same video in same format must raise
            with self.assertRaises(ValueError) as ctx:
                self.manager.create({
                    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "kind": "video",
                    "quality": "720",
                })
            self.assertIn("already downloading or in queue", str(ctx.exception))

    def test_clear_queue_cancels_all_queued_jobs(self):
        with patch.object(self.manager, "_run"):
            j1 = self.manager.create({"url": "https://www.youtube.com/watch?v=11111111111", "kind": "video"})
            j2 = self.manager.create({"url": "https://www.youtube.com/watch?v=22222222222", "kind": "video"})
            j3 = self.manager.create({"url": "https://www.youtube.com/watch?v=33333333333", "kind": "video"})

            self.assertEqual(len(self.manager._queue), 2)
            cleared = self.manager.clear_queue()
            self.assertEqual(cleared, 2)
            self.assertEqual(len(self.manager._queue), 0)
            self.assertEqual(j2.status, "cancelled")
            self.assertEqual(j3.status, "cancelled")

    def test_stop_all_cancels_active_and_queue(self):
        with patch.object(self.manager, "_run"):
            j1 = self.manager.create({"url": "https://www.youtube.com/watch?v=11111111111", "kind": "video"})
            j2 = self.manager.create({"url": "https://www.youtube.com/watch?v=22222222222", "kind": "video"})

            res = self.manager.stop_all()
            self.assertTrue(res["stoppedActive"])
            self.assertEqual(res["clearedQueue"], 1)
            self.assertIsNone(self.manager._active_job_id)
            self.assertEqual(len(self.manager._queue), 0)

    def test_clear_cache_empties_saved_cache(self):
        self.manager.add_to_cache("vid1", "video", "Test 1")
        self.manager.add_to_cache("vid2", "audio", "Test 2")
        self.assertEqual(len(self.manager._cache), 2)

        cleared = self.manager.clear_cache()
        self.assertEqual(cleared, 2)
        self.assertEqual(len(self.manager._cache), 0)
        self.assertFalse(self.manager.is_cached("vid1", "video"))

    @patch("service.app.extract_playlist_items")
    def test_playlist_skips_already_cached_videos(self, mock_extract):
        mock_extract.return_value = (
            "Python Course",
            [
                {"id": "v1", "title": "Intro", "url": "https://www.youtube.com/watch?v=11111111111"},
                {"id": "v2", "title": "Variables", "url": "https://www.youtube.com/watch?v=22222222222"},
                {"id": "v3", "title": "Functions", "url": "https://www.youtube.com/watch?v=33333333333"},
            ],
        )
        # Pre-cache video 1
        self.manager.add_to_cache("11111111111", "video", "Intro")

        with patch.object(self.manager, "_run"):
            jobs = self.manager.create_playlist({
                "url": "https://www.youtube.com/playlist?list=PLBCF2DAC6FFB574DE",
                "kind": "video",
                "quality": "1080",
            })
            # Only v2 and v3 should be created
            self.assertEqual(len(jobs), 2)
            self.assertEqual(self.manager._last_playlist_skipped, 1)
            self.assertEqual(jobs[0].url, "https://www.youtube.com/watch?v=22222222222")

    @patch("service.app.extract_playlist_items")
    def test_playlist_all_cached_returns_empty_and_skipped_count(self, mock_extract):
        mock_extract.return_value = (
            "Python Course",
            [
                {"id": "v1", "title": "Intro", "url": "https://www.youtube.com/watch?v=11111111111"},
                {"id": "v2", "title": "Variables", "url": "https://www.youtube.com/watch?v=22222222222"},
            ],
        )
        # Pre-cache both videos
        self.manager.add_to_cache("11111111111", "video")
        self.manager.add_to_cache("22222222222", "video")

        with patch.object(self.manager, "_run"):
            jobs = self.manager.create_playlist({
                "url": "https://www.youtube.com/playlist?list=PLBCF2DAC6FFB574DE",
                "kind": "video",
            })
            self.assertEqual(len(jobs), 0)
            self.assertEqual(self.manager._last_playlist_skipped, 2)


if __name__ == "__main__":
    unittest.main()
