# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---
- Implemented `GET /api/capacity` with offset pagination. Each person's allocated hours and capacity are keyed by the Monday of each week. Partial weeks count only the selected weekdays.
- Implemented `PATCH /api/people/{id}` to validate and save weekly hours and return the saved value. Invalid hours return 400 and an unknown person returns 404.
