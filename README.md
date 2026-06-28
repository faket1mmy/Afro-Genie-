# 🧞 Afro-Genie

An AI-powered natural hair care assistant that combines African hair wisdom with modern AI. Get personalized advice for every curl, coil, and kink.

## Features

- **AI Chat** — Real-time streaming chat with Afro-Genie, powered by Claude. Ask anything about natural hair care, styles, and African hair traditions.
- **Hair Quiz** — 5-question quiz to determine your hair type (4A, 4B, 4C, etc.) with tailored care tips and style recommendations.
- **Beautiful UI** — African-inspired design with warm earth tones, custom typography, and smooth animations.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| Backend | Node.js + Express + TypeScript |
| AI | Anthropic Claude API (streaming SSE) |

## Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
# Clone and install all dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Development

```bash
# Run both client and server in parallel
npm run dev

# Or run separately:
npm run dev:client   # http://localhost:5173
npm run dev:server   # http://localhost:3001
```

### Build for Production

```bash
npm run build
```

## Environment Variables

Create a `.env` file in the root (or `server/`) directory:

```env
ANTHROPIC_API_KEY=your_api_key_here
PORT=3001
CLIENT_URL=http://localhost:5173
```

> The app runs without an API key, but the AI chat will return an error message. The Hair Quiz works fully without a key.

## Project Structure

```
afro-genie/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── pages/          # Home, Chat, HairQuiz
│       └── components/     # Navbar, ChatMessage, ChatInput
└── server/                 # Express backend
    └── src/
        ├── index.ts
        └── routes/chat.ts  # Streaming Claude API
```
