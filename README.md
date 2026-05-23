# Striver A2Z DSA Tracker

A static web tracker for the Striver A2Z DSA Sheet with 284 problems, grouped by topic and difficulty.

## Features

- 284 DSA problems with LeetCode and GFG links
- Topic-wise navigation
- Search by problem name
- Filter by difficulty or completed status
- Progress bar and completed count
- Persistent checkbox progress using browser `localStorage`

## How to Use

Open `index.html` in your browser.

You can mark any problem as done using the checkbox in the `Done` column. Your progress is saved automatically in the browser, so it stays after refresh or reopening the page on the same device and browser.

## Project Files

- `index.html` - Main tracker page
- `script.js` - Progress saving, filtering, search, and navigation logic
- `striverDSA` - Older/alternate copy of the tracker page

## Notes

Progress is stored locally in your browser. It will remain saved unless you clear browser site data, use a different browser, or open the project on another device.
