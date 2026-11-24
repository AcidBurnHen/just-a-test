# Decisions

- First implement two routes 

1. GET /api/capacity?from=&to=
- The pattern for this will be view-specific DTO + offset-based pagination 
- Use date-keyed response, direct mapping to the grid, explicit week identifiers and minimal frontend transformations
- On success render the returned capacity data for the selected date range and page.
- On failure preserve previously loaded data, indicate that it may be stale, and then we display an error with a retry option. Also, showing an error state if no data has been loaded

2. OATCH -/api/people/{id}
- Here let's do -> cache invalidation & pessimistic mutation
- Wait for server confirmation before updating the grid, invalidate cached capacity data and keep capacity calculations centralized on the backend
- On success refetch the visible page and date range using server-calculated values
- On failer retain the entered value, keep the editor open and display a retry message

- Then I test the response on Postman


## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

-

## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

-

## What did the AI get wrong that you caught?

One concrete example. Every real session has one.

-

## What would you do differently with a week?

-
