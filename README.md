Interview Integrity Monitoring — Backend

Lightweight FastAPI backend for AI-powered interview integrity monitoring.

## Requirements

- Python 3.9+
- See `requirements.txt` for Python dependencies

## Quick start (local)

1. Create and activate your virtualenv:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. (Optional) Create a `.env` file or set `DATABASE_URL` for your Postgres DB. The app uses `python-dotenv`/`pydantic-settings` for configuration.

3. Run the app with Uvicorn (development):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open the interactive API docs at: `http://localhost:8000/docs` (Swagger) or `http://localhost:8000/redoc`.

## Migrations

Apply database migrations with Alembic:

```bash
alembic upgrade head
```

## Run with Docker Compose

If a `docker-compose.yml` is provided, build and start services:

```bash
docker-compose up --build
```

## Tests

Run the test suite with:

```bash
pytest -q
```

## Notes

- The FastAPI application entrypoint is `app/main.py`.
- Environment/configuration is handled via `pydantic-settings` and `.env` files.
- If you need help wiring up Docker or Postgres connection details, tell me what you'd like configured and I can add an example `docker-compose.yml` and `.env`.
uvicorn app.main:app --reload