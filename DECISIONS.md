# Decisions

- First implement two routes 

1. GET /api/capacity?from=&to=
- The pattern for this will be view-specific DTO + offset-based pagination 
- Use date-keyed response, direct mapping to the grid, explicit week identifiers and minimal frontend transformations
- On success render the returned capacity data for the selected date range and page.
- On failure preserve previously loaded data, indicate that it may be stale, and then we display an error with a retry option. Also, showing an error state if no data has been loaded

2. PATCH -/api/people/{id}
- Here let's do -> cache invalidation & pessimistic mutation
- Wait for server confirmation before updating the grid, invalidate cached capacity data and keep capacity calculations centralized on the backend
- On success refetch the visible page and date range using server-calculated values
- On failer retain the entered value, keep the editor open and display a retry message

- Tested the APIs on Postman (used AI to scaffold collections for quicker testing data)

- Organized the frontend code in a few ways: 
    - - Used guard clauses, explicit if statements and spacing between logical steps (rules for the AI) so I could  trace what the code was doing while reviewing AI's implementation
    - Split styling from global styles.css into modular css files, to avoid bloat and allow the repo to grow
    - Created utils.ts file to isolate helper functions, would organize this differently on a bigger repo
    - Create a components folder and tests folder to isolate components and tests.

## What did the spec not tell you?

The spec only defined how to handle full weeks, not how to handle partial weeks. The problem is if someone works for idk 24 hours per week, and decide to look at 3 days in week if they are available, they are not at full availability as somone working 40 hours. Adapted the GET capacatiy API calculates to take care of that during plan phase. 

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
