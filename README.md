# Striver A2Z DSA Tracker

A static web tracker for the Striver A2Z DSA Sheet with 284 problems, grouped by topic and difficulty.

## Features

- 284 DSA problems with LeetCode and GFG links
- Topic-wise navigation
- Search by problem name
- Filter by difficulty or completed status
- Progress bar and completed count
- Username-only login
- Persistent checkbox progress and progress history using MongoDB
- Browser `localStorage` fallback when the backend is unavailable

## How to Use

Install dependencies:

```bash
npm install
```

Create a `.env` file from `.env.example` and set `MONGODB_URI`.

Start the app:

```bash
npm start
```

Open `http://localhost:3000` in your browser. Enter a username to create or access that account, then mark problems as done using the checkbox in the `Done` column.

## Project Files

- `index.html` - Main tracker page
- `script.js` - Login, progress saving, filtering, search, and navigation logic
- `server.js` - Express API and MongoDB persistence
- `striverDSA` - Older/alternate copy of the tracker page

## Notes

Progress is stored in MongoDB per username. Each progress save also appends a history snapshot, capped at the most recent 100 updates per user.
