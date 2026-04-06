const crypto = require("crypto");

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hashedPassword = crypto.scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${hashedPassword}`;
}

function passwordMatches(password, storedPassword) {
  if (!storedPassword || !storedPassword.includes(":")) {
    return false;
  }

  const [salt, savedHash] = storedPassword.split(":");
  const hashedBuffer = crypto.scryptSync(password, salt, 64);
  const savedBuffer = Buffer.from(savedHash, "hex");

  if (hashedBuffer.length !== savedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(hashedBuffer, savedBuffer);
}

function normalizeSeatCount(value) {
  const seatCount = Number(value);

  if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 10) {
    return null;
  }

  return seatCount;
}

function getUtcDateOnly(dateValue) {
  const date = new Date(dateValue);

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function getDateKey(dateValue) {
  return getUtcDateOnly(dateValue).toISOString().split("T")[0];
}

function getMonthValue(dateValue) {
  const date = new Date(dateValue);
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");

  return `${date.getUTCFullYear()}-${month}`;
}

function getMonthStart(monthValue, referenceDate = new Date()) {
  const monthPattern = /^\d{4}-\d{2}$/;

  if (monthValue && monthPattern.test(monthValue)) {
    const [year, month] = monthValue.split("-").map(Number);

    return new Date(Date.UTC(year, month - 1, 1));
  }

  return new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      1
    )
  );
}

function getEventDate(registration) {
  if (registration.eventDetails && registration.eventDetails.date) {
    return registration.eventDetails.date;
  }

  if (registration.eventId && registration.eventId.date) {
    return registration.eventId.date;
  }

  return registration.eventDate;
}

function formatDayLabel(dateValue) {
  return new Date(dateValue).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatFullDayLabel(dateValue) {
  return new Date(dateValue).toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isPastEvent(dateValue, referenceDate = new Date()) {
  return getUtcDateOnly(dateValue).getTime() < getUtcDateOnly(referenceDate).getTime();
}

function groupRegistrationsByDate(registrations, referenceDate = new Date()) {
  const groupsByDate = {};

  registrations
    .filter((registration) => getEventDate(registration))
    .sort((firstRegistration, secondRegistration) => {
      return new Date(getEventDate(firstRegistration)) - new Date(getEventDate(secondRegistration));
    })
    .forEach((registration) => {
      const eventDate = getEventDate(registration);
      const dateKey = getDateKey(eventDate);

      if (!groupsByDate[dateKey]) {
        groupsByDate[dateKey] = {
          dateKey,
          date: getUtcDateOnly(eventDate),
          dayLabel: formatDayLabel(eventDate),
          fullDateLabel: formatFullDayLabel(eventDate),
          isPast: isPastEvent(eventDate, referenceDate),
          registrations: [],
        };
      }

      groupsByDate[dateKey].registrations.push(registration);
    });

  return Object.values(groupsByDate).reduce(
    (groupedRegistrations, currentGroup) => {
      if (currentGroup.isPast) {
        groupedRegistrations.past.push(currentGroup);
      } else {
        groupedRegistrations.upcoming.push(currentGroup);
      }

      return groupedRegistrations;
    },
    {
      upcoming: [],
      past: [],
    }
  );
}

function buildCalendarRows(registrations, monthValue, referenceDate = new Date()) {
  const monthStart = getMonthStart(monthValue, referenceDate);
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)
  );
  const firstCalendarDay = new Date(monthStart);
  const lastCalendarDay = new Date(monthEnd);
  const registrationsByDate = {};
  const rows = [];

  firstCalendarDay.setUTCDate(firstCalendarDay.getUTCDate() - firstCalendarDay.getUTCDay());
  lastCalendarDay.setUTCDate(
    lastCalendarDay.getUTCDate() + (6 - lastCalendarDay.getUTCDay())
  );

  registrations.forEach((registration) => {
    const eventDate = getEventDate(registration);

    if (!eventDate) {
      return;
    }

    const dateKey = getDateKey(eventDate);

    if (!registrationsByDate[dateKey]) {
      registrationsByDate[dateKey] = [];
    }

    registrationsByDate[dateKey].push(registration);
  });

  for (
    let dayCursor = new Date(firstCalendarDay);
    dayCursor <= lastCalendarDay;
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1)
  ) {
    const calendarDate = new Date(dayCursor);
    const dateKey = getDateKey(calendarDate);
    const rowIndex = Math.floor(rows.flat().length / 7);

    if (!rows[rowIndex]) {
      rows[rowIndex] = [];
    }

    rows[rowIndex].push({
      date: calendarDate,
      dateKey,
      dateNumber: calendarDate.getUTCDate(),
      isCurrentMonth: calendarDate.getUTCMonth() === monthStart.getUTCMonth(),
      isToday: getDateKey(calendarDate) === getDateKey(referenceDate),
      registrations: registrationsByDate[dateKey] || [],
    });
  }

  return rows;
}

function getPreviousMonthValue(monthValue, referenceDate = new Date()) {
  const monthStart = getMonthStart(monthValue, referenceDate);
  const previousMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1)
  );

  return getMonthValue(previousMonth);
}

function getNextMonthValue(monthValue, referenceDate = new Date()) {
  const monthStart = getMonthStart(monthValue, referenceDate);
  const nextMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)
  );

  return getMonthValue(nextMonth);
}

module.exports = {
  buildCalendarRows,
  createPasswordHash,
  getMonthStart,
  getMonthValue,
  getNextMonthValue,
  getPreviousMonthValue,
  groupRegistrationsByDate,
  isPastEvent,
  normalizeSeatCount,
  passwordMatches,
};
