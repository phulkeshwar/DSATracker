# Striver A2Z + Love Babbar DSA Tracker

A full-stack web app to track your progress through the combined **Striver A2Z DSA Sheet** and **Love Babbar 450 DSA Sheet** (LeetCode Edition). This tracker includes exactly **770 unique questions** across 18 topic-based steps after programmatically resolving and removing **116 duplicates**. Features secure authentication, real-time cloud-synced progress, and SEO optimization.

## Features

- **770 Unique DSA problems** (Striver A2Z + Love Babbar 450 combined, 116 duplicates filtered) with direct LeetCode and GeeksforGeeks links.
- **Competitor Sheet Analysis** — visual comparison with Striver A2Z, Love Babbar, NeetCode 150, and Blind 75.
- **Search Engine Optimization (SEO)** — injected semantic structured data (JSON-LD WebApplication & FAQPage schemas) and metadata for search discoverability.
- **Secure authentication** — register and login with username + password (bcrypt hashed)
- **JWT session tokens** — stay logged in for 30 days, auto-login on page refresh
- **Legacy account migration** — existing users without passwords are prompted to set one
- **Cloud-synced progress** — checkboxes saved to MongoDB in real-time with debounced writes
- **Progress history** — each save creates a snapshot (up to 100 per user)
- **Offline fallback** — progress saved to `localStorage` when the server is unavailable
- **Difficulty stats** — live counts for Easy, Medium, Hard, and Done problems
- **Search & filter** — search by problem name, filter by difficulty or completion status
- **Sidebar navigation** — jump to any of the 18 steps instantly
- **Dark theme** — premium dark UI with JetBrains Mono + Syne fonts and smooth animations
- **Responsive** — works on desktop and mobile

## Tech Stack

| Layer      | Technology                            |
|------------|---------------------------------------|
| Frontend   | HTML, Vanilla CSS, Vanilla JavaScript |
| Backend    | Node.js, Express.js                   |
| Database   | MongoDB (via Mongoose)                |
| Auth       | bcryptjs (hashing), jsonwebtoken (JWT)|
| Deployment | Vercel (serverless)                   |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (or local MongoDB)

### Installation

```bash
git clone https://github.com/phulkeshwar/DSA.git
cd DSA
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/
PORT=3001
JWT_SECRET=your_secret_key_here
```

| Variable      | Description                                      |
|---------------|--------------------------------------------------|
| `MONGODB_URI` | MongoDB connection string                        |
| `PORT`        | Server port (default: `3000`)                    |
| `JWT_SECRET`  | Secret key for signing JWT tokens (change this!) |

### Run Locally

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

Open **http://localhost:3001** in your browser.

## API Endpoints

### Authentication

| Method | Endpoint         | Description                                    | Auth Required |
|--------|------------------|------------------------------------------------|---------------|
| POST   | `/api/register`  | Create a new account (username + password)     | No            |
| POST   | `/api/login`     | Login with username + password, returns JWT    | No            |
| POST   | `/api/migrate`   | Set password for legacy accounts (no password) | No            |
| GET    | `/api/me`        | Verify JWT token, return user data             | Yes           |

### Progress

| Method | Endpoint                          | Description                     | Auth Required |
|--------|-----------------------------------|---------------------------------|---------------|
| GET    | `/api/users/:username/progress`   | Get user's solved problems      | Yes           |
| PUT    | `/api/users/:username/progress`   | Save solved problems + snapshot | Yes           |

### Health

| Method | Endpoint       | Description              | Auth Required |
|--------|----------------|--------------------------|---------------|
| GET    | `/api/health`  | Check server & DB status | No            |

## Project Structure

```
├── index.html      # Main tracker page (HTML + inline CSS)
├── script.js       # Frontend auth, progress sync, filtering, search
├── server.js       # Express API, MongoDB models, auth middleware
├── package.json    # Dependencies and scripts
├── vercel.json     # Vercel deployment config
├── .env            # Environment variables (not committed)
└── .gitignore      # Git ignore rules
```

## Authentication Flow

1. **New users** → Register tab → enter username + password → account created → auto-login
2. **Returning users** → Login tab → enter credentials → JWT issued → auto-login
3. **Legacy users** (created before passwords) → Login → prompted to set a password → progress preserved
4. **Page refresh** → saved JWT verified via `/api/me` → auto-login without re-entering credentials
5. **Logout** → clears JWT + username from `localStorage`

## Deployment

The app is configured for **Vercel** deployment via `vercel.json`. Push to your connected GitHub repo and Vercel will auto-deploy.

Make sure to set environment variables (`MONGODB_URI`, `JWT_SECRET`) in your Vercel project settings.

## License

This project is for personal use and educational purposes.
