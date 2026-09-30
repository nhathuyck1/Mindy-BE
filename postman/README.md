# Mindy Postman checks

## Import

Import both files into Postman:

- `Mindy-BE.postman_collection.json`
- `Mindy-Local.postman_environment.json`

Select the **Mindy Local** environment and set `admin_password` to the same value as
`SEED_ADMIN_PASSWORD` in the local `.env` file.

## Cookie authentication

Postman manages `access_token` and `refresh_token` in its cookie jar automatically.
Do not copy either token into an Authorization header or an environment variable.

After **Login admin**, open **Cookies** for `localhost` to inspect the cookie names.
The cookies are `HttpOnly`, so scripts cannot read their values. The refresh cookie is
restricted to `/api/v1/auth/refresh`; that is expected.

If login succeeds but an authenticated request returns `401`, delete old cookies for
`localhost` in Postman and run **Login admin** again.

## Suggested order

1. Run both requests in `00 — Health`.
2. Run `Login admin`, `Current user`, and `Refresh cookies`.
3. Run the requests in `02 — Admin users` from top to bottom.
4. Run `Logout current session`, then `Me after logout — expect 401`.
5. To test `Logout all sessions`, log in again before running it.

The collection creates a unique student email on each run and stores the returned ID
as a collection variable for the following get/suspend/reactivate requests.
