# Agent guide

## Product rules

- Keep all media processing local to the user's machine.
- Do not add DRM bypassing, login/session theft, paywall bypassing, or private
  video access features.
- Keep the explicit rights/permission confirmation in the download flow.
- Do not add playlist or channel bulk-download support without a deliberate
  product and abuse review.

## Repository map

- `extension/` — Manifest V3 Chrome/Chromium extension.
- `service/` — Python standard-library HTTP service and `yt-dlp` runner.
- `scripts/` — setup and launch helpers.
- `tests/` — Python unit tests.
- `project.md` — product scope, design, and acceptance criteria.

## Development commands

```sh
python3 -m unittest discover -s tests -v
python3 -m py_compile service/*.py
./scripts/check.sh
```

## Implementation conventions

- Prefer Python's standard library for the local service.
- Never interpolate a submitted URL into a shell command. Pass arguments as a
  list to `subprocess.Popen` with `shell=False`.
- Bind the companion service to `127.0.0.1`, not all network interfaces.
- Validate authentication, request origin, content type, URL, and request size
  before creating a job.
- Avoid logging access tokens or query strings containing secrets.
- Keep extension permissions minimal.

## Definition of done

- Tests and syntax checks pass.
- New behavior has an automated test where practical.
- `README.md` reflects any setup or user-facing behavior changes.
- Manual browser testing steps are recorded when automation cannot cover them.

