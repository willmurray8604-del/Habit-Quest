# Habit Quest v5.2 — iPhone Safari Sign-In Fix

Based on the exact working files supplied by the user.

Changed:
- Google authentication now uses `signInWithPopup()` on all devices
- Removed dependency on Firebase redirect completion for iPhone Safari
- Added clearer popup-blocked and cancelled-login messages
- Restores the sign-in button after any failed attempt
- Service-worker cache version updated

Unchanged:
- Design
- Habits
- Notes and handwriting
- Firebase data structure
- Statistics
- Charts
- Calendar
- Streaks
