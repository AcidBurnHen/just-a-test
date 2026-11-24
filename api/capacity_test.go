package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Each test uses a single connection with its own temporary roster.
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run the PostgreSQL tests")
	}

	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}

	config.MaxConns = 1
	config.ConnConfig.RuntimeParams["search_path"] = "pg_temp"
	config.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, `
CREATE TEMP TABLE people (id int, name text, weekly_hours numeric);
		CREATE TEMP TABLE assignments (person_id int, start_date date, end_date date, hours_per_day numeric);
		INSERT INTO people VALUES (1, 'Part time', 20), (2, 'Unassigned', 0);
		INSERT INTO assignments VALUES
		    (1, '2025-12-29', '2026-01-05', 1.5),
		    (1, '2026-01-02', '2026-01-02', 3),
		    (1, '2026-01-03', '2026-01-04', 8);`)
		return err
	}

	pool, err := pgxpool.NewWithConfig(t.Context(), config)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(pool.Close)
	return pool
}

func TestCapacityQuery(t *testing.T) {
	pool := testPool(t)

	// From Thursday through Monday: two workdays in one year-crossing
	// week and one in the next. The weekend-only assignment contributes zero.
	from, _ := time.Parse(time.DateOnly, "2026-01-01")
	to := from.AddDate(0, 0, 4)
	rows, err := pool.Query(t.Context(), capacityQuery, from, to, pageSize, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type cell struct {
		id                  int
		week                string
		capacity, allocated float64
	}
	want := []cell{{1, "2025-12-29", 8, 6}, {1, "2026-01-05", 4, 1.5},
		{2, "2025-12-29", 0, 0}, {2, "2026-01-05", 0, 0}}
	var i int
	for rows.Next() {
		var got cell
		if err := rows.Scan(&got.id, nil, nil, nil, &got.week, &got.capacity, &got.allocated); err != nil {
			t.Fatal(err)
		}
		if i >= len(want) || got != want[i] {
			t.Fatalf("unexpected row %d: %+v", i, got)
		}
		i++
	}
	if rows.Err() != nil || i != len(want) {
		t.Fatalf("received %d rows: %v", i, rows.Err())
	}
}

func assertJSONResponse(t *testing.T, response *httptest.ResponseRecorder, want string) {
	t.Helper()

	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body.String())
	}

	if got := response.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("expected JSON, got %q", got)
	}

	// Compare wire keys and values independently of the server's Go types
	// and the order in which JSON object keys were serialized.
	var actual, expected any
	if err := json.Unmarshal(response.Body.Bytes(), &actual); err != nil {
		t.Fatal(err)
	}

	if err := json.Unmarshal([]byte(want), &expected); err != nil {
		t.Fatal(err)
	}

	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("response: %s\nexpected: %s", response.Body.String(), want)
	}
}

func TestGetCapacityAcrossNewYear(t *testing.T) {
	s := server{db: testPool(t)}
	req := httptest.NewRequest(http.MethodGet, "/api/capacity?from=2025-12-31&to=2026-01-05", nil)
	response := httptest.NewRecorder()

	s.handleCapacity(response, req)

	// Wed-Fri: 3 x 1.5 hours plus Friday's extra 3. Monday: 1.5 hours.
	assertJSONResponse(t, response, `{
        "weeks":["2025-12-29","2026-01-05"], "total":2, "pageSize":25,
        "people":[
          {"id":1,"name":"Part time","weeklyHours":20,"weeks":{
            "2025-12-29":{"allocated":7.5,"capacity":12},
            "2026-01-05":{"allocated":1.5,"capacity":4}}},
          {"id":2,"name":"Unassigned","weeklyHours":0,"weeks":{
            "2025-12-29":{"allocated":0,"capacity":0},
            "2026-01-05":{"allocated":0,"capacity":0}}}
        ]}`)
}

func TestPatchZeroPersistsAfterRejectedEdit(t *testing.T) {
	s := server{db: testPool(t)}

	patch := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPatch, "/api/people/1", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.SetPathValue("id", "1")

		response := httptest.NewRecorder()
		s.handleUpdatePerson(response, req)

		return response
	}

	verifyRead := func() {
		t.Helper()

		req := httptest.NewRequest(http.MethodGet, "/api/capacity?from=2026-01-05&to=2026-01-05", nil)
		response := httptest.NewRecorder()
		s.handleCapacity(response, req)

		assertJSONResponse(t, response, `{
            "weeks":["2026-01-05"], "total":2, "pageSize":25,
            "people":[
              {"id":1,"name":"Part time","weeklyHours":0,"weeks":{"2026-01-05":{"allocated":1.5,"capacity":0}}},
              {"id":2,"name":"Unassigned","weeklyHours":0,"weeks":{"2026-01-05":{"allocated":0,"capacity":0}}}
            ]}`)
	}

	assertJSONResponse(t, patch(`{"weeklyHours":0}`), `{"id":1,"weeklyHours":0}`)
	verifyRead()

	rejected := patch(`{"weeklyHours":-1}`)
	if rejected.Code != http.StatusBadRequest {
		t.Fatalf("negative hours: expected 400, got %d", rejected.Code)
	}

	verifyRead()
}
