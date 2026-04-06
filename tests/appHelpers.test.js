const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPasswordHash,
  passwordMatches,
  normalizeSeatCount,
  buildCalendarRows,
  groupRegistrationsByDate,
  isPastEvent,
  getMonthValue,
} = require("../appHelpers");

test("createPasswordHash stores a password that passwordMatches can verify", () => {
  const password = "student-secret";
  const hashedPassword = createPasswordHash(password);

  assert.notEqual(hashedPassword, password);
  assert.equal(passwordMatches(password, hashedPassword), true);
  assert.equal(passwordMatches("wrong-password", hashedPassword), false);
});

test("normalizeSeatCount accepts whole numbers between 1 and 10", () => {
  assert.equal(normalizeSeatCount("1"), 1);
  assert.equal(normalizeSeatCount("10"), 10);
  assert.equal(normalizeSeatCount("0"), null);
  assert.equal(normalizeSeatCount("11"), null);
  assert.equal(normalizeSeatCount("3.5"), null);
  assert.equal(normalizeSeatCount("abc"), null);
});

test("buildCalendarRows places registrations on the matching day in the month grid", () => {
  const registrations = [
    {
      _id: "first-registration",
      eventTitle: "Spring Workshop",
      eventDetails: {
        date: new Date("2026-04-10T00:00:00.000Z"),
      },
    },
    {
      _id: "second-registration",
      eventTitle: "Late Concert",
      eventDetails: {
        date: new Date("2026-04-28T00:00:00.000Z"),
      },
    },
  ];

  const rows = buildCalendarRows(registrations, "2026-04");
  const flattenedDays = rows.flat();
  const tenthDay = flattenedDays.find((day) => day.dateNumber === 10);
  const twentyEighthDay = flattenedDays.find((day) => day.dateNumber === 28);

  assert.equal(rows.length > 0, true);
  assert.equal(tenthDay.registrations.length, 1);
  assert.equal(tenthDay.registrations[0].eventTitle, "Spring Workshop");
  assert.equal(twentyEighthDay.registrations.length, 1);
  assert.equal(twentyEighthDay.registrations[0].eventTitle, "Late Concert");
});

test("groupRegistrationsByDate separates upcoming and past event groups", () => {
  const referenceDate = new Date("2026-04-15T00:00:00.000Z");
  const registrations = [
    {
      _id: "upcoming-registration",
      eventTitle: "Future Fair",
      eventDetails: {
        date: new Date("2026-04-20T00:00:00.000Z"),
      },
    },
    {
      _id: "past-registration",
      eventTitle: "Past Expo",
      eventDetails: {
        date: new Date("2026-04-05T00:00:00.000Z"),
      },
    },
  ];

  const groupedRegistrations = groupRegistrationsByDate(registrations, referenceDate);

  assert.equal(groupedRegistrations.upcoming.length, 1);
  assert.equal(groupedRegistrations.upcoming[0].registrations[0].eventTitle, "Future Fair");
  assert.equal(groupedRegistrations.past.length, 1);
  assert.equal(groupedRegistrations.past[0].registrations[0].eventTitle, "Past Expo");
});

test("isPastEvent compares dates using full UTC calendar days", () => {
  const referenceDate = new Date("2026-04-15T13:00:00.000Z");

  assert.equal(isPastEvent(new Date("2026-04-14T23:59:59.000Z"), referenceDate), true);
  assert.equal(isPastEvent(new Date("2026-04-15T00:00:00.000Z"), referenceDate), false);
  assert.equal(isPastEvent(new Date("2026-04-16T00:00:00.000Z"), referenceDate), false);
});

test("getMonthValue returns a year-month string in UTC", () => {
  const date = new Date("2026-11-03T12:00:00.000Z");

  assert.equal(getMonthValue(date), "2026-11");
});
