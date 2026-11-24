package main

import (
	"log"
	"net/http"
	"strconv"
	"time"
)

const pageSize = 25

// Dates are inclusive. Each week is clipped to both the selected interval and
// Monday-Friday. Subtracting dates keeps the arithmetic independent of DST.
const capacityQuery = `
WITH roster AS (
    SELECT id, name, weekly_hours, count(*) OVER () AS total
    FROM people ORDER BY id LIMIT $3 OFFSET $4
), weeks AS (
    SELECT monday::date AS start,
           greatest(monday::date, $1::date) AS first_day,
           least(monday::date + 4, $2::date) AS last_day
    FROM generate_series(date_trunc('week', $1::date::timestamp),
                         $2::date::timestamp, interval '1 week') monday
)
SELECT r.id, r.name, r.weekly_hours, r.total, to_char(w.start, 'YYYY-MM-DD'),
       r.weekly_hours * greatest(0, w.last_day - w.first_day + 1) / 5 AS capacity,
       coalesce(sum(a.hours_per_day * greatest(0,
           least(a.end_date, w.last_day) - greatest(a.start_date, w.first_day) + 1)), 0) AS allocated
FROM roster r CROSS JOIN weeks w
LEFT JOIN assignments a ON a.person_id = r.id
    AND a.start_date <= w.last_day AND a.end_date >= w.first_day
GROUP BY r.id, r.name, r.weekly_hours, r.total, w.start, w.first_day, w.last_day
ORDER BY r.id, w.start`

type weekLoad struct {
	Capacity  float64 `json:"capacity"`
	Allocated float64 `json:"allocated"`
}

type personLoad struct {
	ID          int                 `json:"id"`
	Name        string              `json:"name"`
	WeeklyHours float64             `json:"weeklyHours"`
	Weeks       map[string]weekLoad `json:"weeks"`
}

type capacityPage struct {
	Weeks    []string     `json:"weeks"`
	People   []personLoad `json:"people"`
	Total    int          `json:"total"`
	PageSize int          `json:"pageSize"`
}

func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, fromErr := time.Parse(time.DateOnly, q.Get("from"))
	to, toErr := time.Parse(time.DateOnly, q.Get("to"))

	if fromErr != nil || toErr != nil || from.Year() < 1 || to.Before(from) || to.After(from.AddDate(2, 0, 0)) {
		http.Error(w, "Choose an ordered date range of up to two years.", http.StatusBadRequest)
		return
	}

	page := int64(1)
	if q.Has("page") {
		n, err := strconv.ParseInt(q.Get("page"), 10, 32)
		if err != nil || n < 1 {
			http.Error(w, "Page must be a positive integer.", http.StatusBadRequest)
			return
		}
		page = n
	}

	rows, err := s.db.Query(r.Context(), capacityQuery, from, to, pageSize, (page-1)*pageSize)
	if err != nil {
		log.Printf("capacity query: %v", err)
		http.Error(w, "Could not load capacity.", http.StatusInternalServerError)
		return
	}

	defer rows.Close()

	result := capacityPage{Weeks: []string{}, People: []personLoad{}, PageSize: pageSize}
	for rows.Next() {
		var p personLoad
		var week string
		var load weekLoad

		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours, &result.Total, &week, &load.Capacity, &load.Allocated); err != nil {
			log.Printf("capacity row: %v", err)
			http.Error(w, "Could not read capacity.", http.StatusInternalServerError)
			return
		}

		n := len(result.People)
		if n == 0 || result.People[n-1].ID != p.ID {
			p.Weeks = make(map[string]weekLoad)
			result.People = append(result.People, p)
		}

		person := &result.People[len(result.People)-1]
		person.Weeks[week] = load
		if len(result.People) == 1 {
			result.Weeks = append(result.Weeks, week)
		}

	}

	if err := rows.Err(); err != nil {
		log.Printf("capacity rows: %v", err)
		http.Error(w, "Could not finish loading capacity.", http.StatusInternalServerError)
		return
	}

	if page > 1 && len(result.People) == 0 {
		http.Error(w, "Roster page does not exist.", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, result)
}
