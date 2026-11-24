package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 32)
	if err != nil || id < 1 {
		http.Error(w, "Invalid person ID.", http.StatusBadRequest)
		return
	}

	var change struct {
		WeeklyHours *float64 `json:"weeklyHours"`
	}

	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&change); err != nil || decoder.Decode(new(any)) != io.EOF ||
		change.WeeklyHours == nil || *change.WeeklyHours < 0 || *change.WeeklyHours > 168 {
		http.Error(w, "Weekly hours must be a number between 0 and 168.", http.StatusBadRequest)
		return
	}

	var hours float64
	err = s.db.QueryRow(r.Context(), `UPDATE people SET weekly_hours = $1 WHERE id = $2 RETURNING weekly_hours`, *change.WeeklyHours, id).Scan(&hours)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "Person not found.", http.StatusNotFound)
		return
	}

	if err != nil {
		log.Printf("update person: %v", err)
		http.Error(w, "Could not save weekly hours.", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"id": id, "weeklyHours": hours})
}
