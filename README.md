# Habit Quest v7 — Firebase Hosting Authentication Fix

This is the same v7 app with:
- To-do list
- Partial good-habit scoring
- Existing notes, streaks, statistics, calendar, and styling

Authentication change:
- Firebase `authDomain` now uses `habit-quest-31489.web.app`
- This matches the Firebase Hosting domain serving the app
- Service-worker cache bumped so Safari downloads the corrected configuration

Deploy these files from the same folder with:

firebase deploy
