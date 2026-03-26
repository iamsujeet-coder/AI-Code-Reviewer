# AI Code Reviewer (MERN-style)

This project is a full-stack app:
- **Backend**: Express + optional MongoDB persistence
- **Frontend**: Vite (responsive UI) that calls `POST /api/review`
- **AI mode**: Uses OpenAI-compatible or Hugging Face Router based on env config, otherwise returns a **mock/safe review**.

## Folder structure
- `server/` backend
- `client/` frontend

## Prerequisites
- Node.js (tested with Node 22)
- (Optional) MongoDB connection string

## Setup
1. Backend env:
   - Copy `server/.env.example` to `server/.env`
   - Set the AI credentials you use (`OPENAI_API_KEY` or `HF_API_KEY`) to enable real AI
   - Set `MONGODB_URI` (optional for persistence)
2. Frontend env:
   - Copy `client/.env.example` to `client/.env` (optional; defaults to `http://localhost:5000`)

## Run (dev)
From the repo root (`ai-code-reviewer/`):
```bash
npm run dev
```

## Test the API
You can `POST` JSON to:
- `http://localhost:5000/api/review`

Body:
```json
{
  "input": "paste code or a diff here",
  "inputType": "code",
  "language": "JavaScript",
  "context": "optional context"
}
```

## Deploy (Render) - Frontend + Backend together
This project is deployable as a **single Render Web Service** because the backend serves the built React files from `client/dist`.

1. Create a Render **New Web Service**
2. Connect your GitHub repo
3. Set these commands:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start`
4. Add Environment Variables in Render (example for Hugging Face):
   - `AI_PROVIDER=huggingface`
   - `HF_API_KEY=hf_...`
   - `HF_MODEL=openai/gpt-oss-120b:groq`
   - `HF_BASE_URL=https://router.huggingface.co/v1`
   - *(optional)* `MONGODB_URI=...`

After deploy, your app UI will be available from Render and calls `POST /api/review` on the same service.

