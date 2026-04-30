# Sir Pinski — Chatbot Scaffold

## Setup

1. Clone this repo and open it in VS Code
2. Install Vercel CLI: `npm i -g vercel`
3. Create a free Google AI Studio account → get a Gemini API key at https://aistudio.google.com
4. Run `vercel dev` locally — it'll ask you to set env vars
5. Set `GEMINI_API_KEY` as an environment variable (in Vercel dashboard for prod, or `.env` locally)

## Project Structure

```
/
├── api/
│   └── chat.js          ← Vercel serverless function (calls Gemini)
├── public/
│   └── index.html       ← The entire frontend (one file)
├── knowledge-base.js    ← Sir Pinski's brain — edit this!
├── vercel.json          ← Routing config
└── package.json
```

## Customizing the Knowledge Base

Open `knowledge-base.js` and fill in:
- Faculty names, personalities, funny quotes
- Gatton Academy handbook rules (the funnier/more obscure the better)
- Folklore, legends, inside jokes
- Events from the video (so Sir Pinski can reference the skit)

## The Dumbness Mechanic

Each hammer click increments `dumbLevel` (0–10). This gets sent to the API
and modifies the system prompt — making Sir Pinski progressively more unhinged.
