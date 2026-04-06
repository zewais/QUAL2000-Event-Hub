# Public User Registrations And Calendar Plan

## Summary

Add a separate public user account flow to the existing Event Hub app so normal users can sign up, log in, register for events, manage only their own registrations, edit seats up to 10 per event, remove events from their calendar, and view their signed-up events in both a monthly calendar and an agenda view. Keep the current admin login and all admin event CRUD behavior unchanged.

## Key Changes

### Data and session wiring

- Add a new `User` model in `models/` with:
  - `name`: required string
  - `email`: required string, trimmed, lowercase, unique
  - `password`: required hashed string
- Keep `Registration` as the user-to-event record, but add `userId` and keep `attendeeName` / `attendeeEmail` as copied snapshot fields from the logged-in account.
- Keep `Event.availableSlots` as remaining seats, not total seats.
- Add public session state separate from admin:
  - `request.session.userId`
  - `request.session.userName`
  - `request.session.userEmail`
- Add `ensureUser` middleware for user-only pages; do not change `ensureAdmin`.

### Public routes and behavior

- Add public auth routes:
  - `GET /register`
  - `POST /register`
  - `GET /login`
  - `POST /login`
  - `POST /logout`
- Keep public browsing routes:
  - `GET /`
  - `GET /events`
  - `GET /events/:id`
- Replace the current “registration form by event id” flow with event-centered routes:
  - `GET /events/:id/register`
  - `POST /events/:id/register`
- Keep user-owned registration management under:
  - `GET /events/registrations` for the “My Events” page
  - `GET /events/registrations/calendar` for the calendar page
  - `GET /events/registrations/:id/edit`
  - `PATCH /events/registrations/:id`
  - `DELETE /events/registrations/:id`
- Registration rules:
  - User must be logged in to register, edit, view personal registrations, or open the calendar.
  - One registration per user per event.
  - If a logged-in user tries to register again for the same event, redirect them to the edit page with a message.
  - Seat count must be an integer from 1 to 10.
  - Create/update must also respect event availability.
  - On edit, validate against `event.availableSlots + currentRegistration.ticketCount` so users can keep or reduce their own seats safely.
  - On create, subtract seats from `Event.availableSlots`.
  - On update, adjust `Event.availableSlots` by the seat-count difference.
  - On delete, restore the registration’s seats to `Event.availableSlots`.
- Ownership rules:
  - A user may only edit/delete/view registrations whose `userId` matches their session.
  - Invalid ids, missing records, or non-owned records should redirect back to the user page with a friendly message instead of exposing other users’ data.

### Views and navigation

- Add simple public auth pages using the existing style and naming rules:
  - `userRegisterPage.ejs`
  - `userLoginPage.ejs`
- Update event detail pages so registration actions depend on login state:
  - logged-out users see a prompt to log in or sign up
  - logged-in users see the register action
- Update the registration form page so it uses account info automatically and only asks for seat count.
- Update `registrationsIndexPage.ejs` into a true “My Events” management page showing only the logged-in user’s registrations, with:
  - event title
  - event date
  - location
  - seat count
  - status
  - past/upcoming indicator
  - edit and remove actions
- Add `registrationsEditPage.ejs` for seat changes.
- Add `registrationsCalendarPage.ejs` showing both:
  - a month grid for the selected month
  - an agenda list grouped by date
- Calendar defaults:
  - default month is the current month
  - month navigation uses a simple `?month=YYYY-MM` query value
  - show all user registrations, with past events visually marked and grouped after upcoming items in the agenda section
- Update `views/partials/publicNav.ejs` so logged-in users can access:
  - Events
  - My Events
  - My Calendar
  - Logout
  - and logged-out users see Login / Register links
- Leave admin views and admin routes unchanged unless a tiny shared-nav adjustment is needed for coexistence.

### Server-side helpers and dependencies

- Add one small password-hashing dependency such as `bcryptjs`.
- Add helper functions in `server.js` for:
  - building user form data
  - building registration data from `request.session`
  - calendar month calculations
  - grouping registrations by day for the agenda view
  - determining whether an event is past or upcoming
- Keep all route handlers in `server.js` and keep the file order compliant with `AGENTS.md`:
  - imports/models
  - dotenv
  - app setup
  - middleware/session
  - database connection
  - public routes
  - admin routes
  - 404 route

## Test Plan

- Public auth:
  - register a new user successfully
  - reject duplicate email
  - reject missing fields
  - log in with valid credentials
  - reject invalid credentials
  - log out and confirm protected pages redirect to login
- Event registration:
  - logged-in user can register for an event with 1 to 10 seats
  - seat request above 10 is rejected
  - seat request above remaining event availability is rejected
  - second registration attempt for the same event redirects to edit instead of creating a duplicate
- My Events:
  - page only shows the logged-in user’s registrations
  - past events are labeled clearly
  - another user cannot open or modify someone else’s registration by URL
- Edit/remove:
  - increasing seats updates availability correctly
  - decreasing seats updates availability correctly
  - deleting a registration restores seats correctly
- Calendar:
  - month grid places events on the correct dates
  - agenda groups by date and includes past/upcoming labeling
  - month navigation via `?month=YYYY-MM` works
- Admin regression:
  - admin login, list, create, edit, and delete event flows still work exactly as before
  - deleting an event still removes related registrations without affecting user accounts

## Assumptions And Defaults

- Public users are a new feature and are separate from admins; there is no shared account model between them.
- No public profile-edit page is added in this change.
- Registration uses the logged-in account identity automatically; the user does not enter attendee name/email per event anymore.
- The 10-seat rule applies per user per event.
- “No change to admin operations” means keep the current admin routes, auth flow, views, and event CRUD behavior intact.
- The calendar is server-rendered EJS only; no SPA or client-side framework is introduced.
