# ScribeFlow

An AI-assisted learning platform that transforms lecture recordings, transcripts, and study notes into GoodNotes-style handwritten cards and active-recall quizzes. Saved study sets are backed up to PostgreSQL and available offline in browser IndexedDB.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: FastAPI, SQLAlchemy, Psycopg 3
- **Database**: PostgreSQL (with automatic resilient local recovery)
- **ML / AI**: Optional scikit-learn TF-IDF + Logistic Regression subject classifier, Groq LLM study-material generation, and hosted Whisper transcription
- **Offline Storage**: IndexedDB (idb) for offline-first card review and progress tracking

---

## Local Development Setup

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- PostgreSQL 14+ (e.g. `brew services start postgresql@16`)

### 2. Backend Setup
1. Create `backend/.env` locally. `.env` files are intentionally excluded from GitHub. Add only the providers you have configured; never commit this file:
   ```bash
   cd backend
   touch .env
   ```
   Add these settings to `backend/.env` as needed:
   ```dotenv
   APP_ENV=development
   DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/scribeflow
   AUTH_DEV_SECRET=<generate-a-unique-random-secret-for-local-development>
   GROQ_API_KEY=<your-groq-api-key>
   TRANSCRIPTION_PROVIDER=groq
   ```
   Generate a local development secret with `python -c 'import secrets; print(secrets.token_urlsafe(48))'`. Keep the generated value private. `GROQ_API_KEY` is required for Groq-based generation/transcription. For production, set `APP_ENV=production`, configure Supabase authentication and production service credentials, and do not enable development login.
2. Initialize virtual environment and run the API server:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   - API Health Check: `http://127.0.0.1:8000/api/health`
   - Interactive API Docs: `http://127.0.0.1:8000/docs`

### 3. Frontend Setup
1. Install dependencies and start Vite:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open the application:
   - **Local URL**: `http://127.0.0.1:5173/` (or `http://localhost:5173/`)

> [!NOTE]
> **Port Conflict Handling & Other Local Projects**:
> ScribeFlow's Vite server is configured with `strictPort: true` to prevent silently auto-incrementing to a conflicting port or serving another running project.
> If another project on your machine is already listening on port 5173, Vite will exit with a clear message: `Port 5173 is already in use`.
> To run ScribeFlow on a dedicated port without stopping your other projects, run:
> ```bash
> npm run dev -- --port 5175
> ```
> and open `http://127.0.0.1:5175/`.

---

## Core Features & Workflow

1. **Lecture Ingestion**:
   - Direct text paste
   - Audio file upload (.mp3, .wav, .m4a, .webm, .ogg up to 100 MB)
   - Live browser microphone dictation
2. **Subject Classification**:
   - Automatic classification across supported academic subjects when a locally trained, rights-cleared model is installed; otherwise the app asks the user to select a subject
   - One-click manual subject adjustment
3. **Structured Notes & Active Recall**:
   - Comprehensive revision notes scaled to exam marks (1 to 5 marks)
   - GoodNotes-style handwritten cards with color-coded formulas and rule boxes
   - 4-level active-recall ratings (*Again*, *Hard*, *Good*, *Easy*) with session progress tracking
4. **Offline Resilience**:
   - IndexedDB synchronization enables offline study set review without an internet connection
   - PostgreSQL persistence ensures all user sets, ratings, and edits are preserved permanently

## Subject Classifier Data and Model

The dataset CSV, trained model, model metadata, and generated evaluation report are excluded from this repository while redistribution rights are reviewed. The dataset builder labels arXiv-derived records as `not verified`; do not publish or use those records for a redistributed model until their applicable licenses have been checked. The source code and training scripts are included, but a fresh clone will not have the trained classifier artifact and subject prediction may return `Unknown / choose a subject` until a rights-cleared dataset is supplied and a model is trained locally.

The previously measured prototype benchmark is not a production guarantee and is not claimed as a reproducible result from this repository because its training data and model artifact are not included.
