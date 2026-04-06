const express = require("express");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const session = require("express-session");
const Event = require("./models/Event");
const Registration = require("./models/Registration");
const User = require("./models/User");
const {
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
} = require("./appHelpers");
require("dotenv").config();

const server = express();
const port = process.env.PORT || 3000;
const dbURI = process.env.DB_URI;
const defaultEventImage =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80";
const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatDateForInput(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().split("T")[0];
}

function formatMonthHeading(monthValue) {
  return getMonthStart(monthValue).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildEventData(requestBody) {
  return {
    title: requestBody.title,
    date: requestBody.date,
    location: requestBody.location,
    category: requestBody.category,
    image: requestBody.image,
    description: requestBody.description,
    availableSlots: Number(requestBody.availableSlots),
  };
}

function buildUserData(requestBody) {
  return {
    name: requestBody.name ? requestBody.name.trim() : "",
    email: requestBody.email ? requestBody.email.trim().toLowerCase() : "",
    password: requestBody.password || "",
  };
}

function buildRegistrationData(request, event, seatCount) {
  return {
    userId: request.session.userId,
    eventId: event._id,
    eventTitle: event.title,
    attendeeName: request.session.userName,
    attendeeEmail: request.session.userEmail,
    ticketCount: seatCount,
    status: "Confirmed",
  };
}

function hasValidId(idValue) {
  return mongoose.Types.ObjectId.isValid(idValue);
}

function ensureAdmin(request, response, next) {
  if (!request.session.isAdminLoggedIn) {
    return response.redirect("/admin/login");
  }

  next();
}

function ensureUser(request, response, next) {
  if (!request.session.userId) {
    return response.redirect("/login?message=Please log in to continue.");
  }

  next();
}

function setUserSession(request, user) {
  request.session.userId = user._id.toString();
  request.session.userName = user.name;
  request.session.userEmail = user.email;
}

function clearUserSession(request) {
  delete request.session.userId;
  delete request.session.userName;
  delete request.session.userEmail;
}

function mapRegistrationWithEventDetails(registration) {
  const registrationObject =
    typeof registration.toObject === "function"
      ? registration.toObject()
      : registration;
  const populatedEvent =
    registrationObject.eventId && registrationObject.eventId._id
      ? registrationObject.eventId
      : null;

  return {
    ...registrationObject,
    eventDetails: {
      _id: populatedEvent ? populatedEvent._id : registrationObject.eventId,
      title: populatedEvent ? populatedEvent.title : registrationObject.eventTitle,
      date: populatedEvent ? populatedEvent.date : null,
      location: populatedEvent ? populatedEvent.location : "",
      category: populatedEvent ? populatedEvent.category : "",
      availableSlots: populatedEvent ? populatedEvent.availableSlots : 0,
    },
    isPast: populatedEvent ? isPastEvent(populatedEvent.date) : false,
  };
}

async function getUserRegistrations(userId) {
  const registrations = await Registration.find({ userId })
    .populate("eventId")
    .sort({ createdAt: -1 });

  return registrations
    .map((registration) => mapRegistrationWithEventDetails(registration))
    .sort((firstRegistration, secondRegistration) => {
      const firstDate = firstRegistration.eventDetails.date
        ? new Date(firstRegistration.eventDetails.date).getTime()
        : Number.MAX_SAFE_INTEGER;
      const secondDate = secondRegistration.eventDetails.date
        ? new Date(secondRegistration.eventDetails.date).getTime()
        : Number.MAX_SAFE_INTEGER;

      return firstDate - secondDate;
    });
}

async function getOwnedRegistration(request, registrationId) {
  if (!hasValidId(registrationId)) {
    return null;
  }

  const registration = await Registration.findById(registrationId).populate("eventId");

  if (!registration || registration.userId.toString() !== request.session.userId) {
    return null;
  }

  return registration;
}

server.set("view engine", "ejs");
server.use(express.static("public"));
server.use(express.urlencoded({ extended: false }));
server.use(express.json());
server.use(methodOverride("_method"));
server.use(
  session({
    secret: process.env.SESSION_SECRET || "event-hub-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2,
    },
  })
);
server.use((request, response, next) => {
  response.locals.currentPath = request.path;
  response.locals.isAdminLoggedIn = request.session.isAdminLoggedIn || false;
  response.locals.isUserLoggedIn = Boolean(request.session.userId);
  response.locals.currentUserName = request.session.userName || "";
  response.locals.currentUserEmail = request.session.userEmail || "";
  response.locals.defaultEventImage = defaultEventImage;
  response.locals.formatDate = formatDate;
  response.locals.formatDateForInput = formatDateForInput;
  next();
});

if (require.main === module) {
  mongoose
    .connect(dbURI)
    .then(() =>
      server.listen(port, () => {
        console.log(`Listening on port ${port}`);
      })
    )
    .catch((error) => console.log(error));
}

// home page route
server.get("/", async (request, response) => {
  const featuredEvents = await Event.find().sort({ date: 1 }).limit(3);

  response.render("homePage", {
    pageTitle: "Event Hub",
    featuredEvents,
    message: request.query.message || "",
  });
});

// public register page route
server.get("/register", (request, response) => {
  if (request.session.userId) {
    return response.redirect("/events/registrations");
  }

  response.render("userRegisterPage", {
    pageTitle: "Create Account",
    formData: {
      name: "",
      email: "",
    },
    message: request.query.message || "",
    errorMessage: "",
  });
});

// public register route
server.post("/register", async (request, response) => {
  if (request.session.userId) {
    return response.redirect("/events/registrations");
  }

  const formData = buildUserData(request.body);

  if (!formData.name || !formData.email || !formData.password) {
    return response.status(400).render("userRegisterPage", {
      pageTitle: "Create Account",
      formData,
      message: "",
      errorMessage: "Please complete every account field.",
    });
  }

  const existingUser = await User.findOne({ email: formData.email });

  if (existingUser) {
    return response.status(400).render("userRegisterPage", {
      pageTitle: "Create Account",
      formData,
      message: "",
      errorMessage: "An account already exists for that email address.",
    });
  }

  try {
    const user = await User.create({
      name: formData.name,
      email: formData.email,
      password: createPasswordHash(formData.password),
    });

    setUserSession(request, user);

    response.redirect(
      "/events/registrations?message=Your account has been created successfully."
    );
  } catch (error) {
    response.status(400).render("userRegisterPage", {
      pageTitle: "Create Account",
      formData,
      message: "",
      errorMessage: "Please enter a valid name, email, and password.",
    });
  }
});

// public login page route
server.get("/login", (request, response) => {
  if (request.session.userId) {
    return response.redirect("/events/registrations");
  }

  response.render("userLoginPage", {
    pageTitle: "Log In",
    formData: {
      email: "",
    },
    message: request.query.message || "",
    errorMessage: "",
  });
});

// public login route
server.post("/login", async (request, response) => {
  if (request.session.userId) {
    return response.redirect("/events/registrations");
  }

  const email = request.body.email ? request.body.email.trim().toLowerCase() : "";
  const password = request.body.password || "";
  const user = await User.findOne({ email });

  if (!user || !passwordMatches(password, user.password)) {
    return response.status(401).render("userLoginPage", {
      pageTitle: "Log In",
      formData: {
        email,
      },
      message: "",
      errorMessage: "Incorrect email address or password.",
    });
  }

  setUserSession(request, user);

  response.redirect("/events/registrations?message=You are now logged in.");
});

// public logout route
server.post("/logout", (request, response) => {
  clearUserSession(request);
  response.redirect("/login?message=You have been logged out.");
});

// my events page route
server.get("/events/registrations", ensureUser, async (request, response) => {
  const registrations = await getUserRegistrations(request.session.userId);

  response.render("registrationsIndexPage", {
    pageTitle: "My Events",
    registrations,
    message: request.query.message || "",
  });
});

// my calendar page route
server.get(
  "/events/registrations/calendar",
  ensureUser,
  async (request, response) => {
    const registrations = await getUserRegistrations(request.session.userId);
    const monthValue = request.query.month || getMonthValue(new Date());

    response.render("registrationsCalendarPage", {
      pageTitle: "My Calendar",
      registrations,
      message: request.query.message || "",
      weekDayLabels,
      monthHeading: formatMonthHeading(monthValue),
      currentMonthValue: getMonthValue(getMonthStart(monthValue)),
      previousMonthValue: getPreviousMonthValue(monthValue),
      nextMonthValue: getNextMonthValue(monthValue),
      calendarRows: buildCalendarRows(registrations, monthValue),
      agendaGroups: groupRegistrationsByDate(registrations),
    });
  }
);

// edit registration page route
server.get(
  "/events/registrations/:id/edit",
  ensureUser,
  async (request, response) => {
    const registration = await getOwnedRegistration(request, request.params.id);

    if (!registration || !registration.eventId) {
      return response.redirect(
        "/events/registrations?message=That registration could not be found."
      );
    }

    const event = registration.eventId;
    const maxSeatCount = Math.min(10, event.availableSlots + registration.ticketCount);

    response.render("registrationsEditPage", {
      pageTitle: "Update Seats",
      registration,
      event,
      formData: {
        ticketCount: registration.ticketCount,
      },
      maxSeatCount,
      message: request.query.message || "",
      errorMessage: "",
    });
  }
);

// update registration route
server.patch("/events/registrations/:id", ensureUser, async (request, response) => {
  const registration = await getOwnedRegistration(request, request.params.id);

  if (!registration || !registration.eventId) {
    return response.redirect(
      "/events/registrations?message=That registration could not be found."
    );
  }

  const event = registration.eventId;
  const seatCount = normalizeSeatCount(request.body.ticketCount);
  const maxSeatCount = Math.min(10, event.availableSlots + registration.ticketCount);

  if (!seatCount) {
    return response.status(400).render("registrationsEditPage", {
      pageTitle: "Update Seats",
      registration,
      event,
      formData: {
        ticketCount: request.body.ticketCount,
      },
      maxSeatCount,
      message: "",
      errorMessage: "Please choose a whole number of seats between 1 and 10.",
    });
  }

  if (seatCount > event.availableSlots + registration.ticketCount) {
    return response.status(400).render("registrationsEditPage", {
      pageTitle: "Update Seats",
      registration,
      event,
      formData: {
        ticketCount: request.body.ticketCount,
      },
      maxSeatCount,
      message: "",
      errorMessage: "There are not enough available slots for that request.",
    });
  }

  const seatDifference = seatCount - registration.ticketCount;

  registration.ticketCount = seatCount;
  registration.attendeeName = request.session.userName;
  registration.attendeeEmail = request.session.userEmail;
  event.availableSlots = event.availableSlots - seatDifference;

  await registration.save();
  await event.save();

  response.redirect("/events/registrations?message=Registration updated successfully.");
});

// delete registration route
server.delete("/events/registrations/:id", ensureUser, async (request, response) => {
  const registration = await getOwnedRegistration(request, request.params.id);

  if (!registration) {
    return response.redirect(
      "/events/registrations?message=That registration could not be found."
    );
  }

  const event = await Event.findById(registration.eventId);

  if (event) {
    event.availableSlots = event.availableSlots + registration.ticketCount;
    await event.save();
  }

  await Registration.findByIdAndDelete(request.params.id);

  response.redirect(
    "/events/registrations?message=Registration removed from your calendar."
  );
});

// events index route
server.get("/events", async (request, response) => {
  const events = await Event.find().sort({ date: 1 });

  response.render("eventsIndexPage", {
    pageTitle: "Explore Events",
    events,
    message: request.query.message || "",
  });
});

// registration form route
server.get("/events/:id/register", ensureUser, async (request, response) => {
  if (!hasValidId(request.params.id)) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  const event = await Event.findById(request.params.id);

  if (!event) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  const existingRegistration = await Registration.findOne({
    userId: request.session.userId,
    eventId: event._id,
  });

  if (existingRegistration) {
    return response.redirect(
      `/events/registrations/${existingRegistration._id}/edit?message=You already joined this event. Update your seats here.`
    );
  }

  if (event.availableSlots < 1) {
    return response.redirect(`/events/${event._id}?message=This event is currently full.`);
  }

  response.render("registrationNewPage", {
    pageTitle: "Register For Event",
    event,
    formData: {
      ticketCount: 1,
    },
    maxSeatCount: Math.min(10, event.availableSlots),
    message: request.query.message || "",
    errorMessage: "",
  });
});

// create registration route
server.post("/events/:id/register", ensureUser, async (request, response) => {
  if (!hasValidId(request.params.id)) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  const event = await Event.findById(request.params.id);

  if (!event) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  const existingRegistration = await Registration.findOne({
    userId: request.session.userId,
    eventId: event._id,
  });

  if (existingRegistration) {
    return response.redirect(
      `/events/registrations/${existingRegistration._id}/edit?message=You already joined this event. Update your seats here.`
    );
  }

  const formData = {
    ticketCount: request.body.ticketCount,
  };
  const seatCount = normalizeSeatCount(request.body.ticketCount);

  if (!seatCount) {
    return response.status(400).render("registrationNewPage", {
      pageTitle: "Register For Event",
      event,
      formData,
      maxSeatCount: Math.min(10, event.availableSlots),
      message: "",
      errorMessage: "Please choose a whole number of seats between 1 and 10.",
    });
  }

  if (seatCount > event.availableSlots) {
    return response.status(400).render("registrationNewPage", {
      pageTitle: "Register For Event",
      event,
      formData,
      maxSeatCount: Math.min(10, event.availableSlots),
      message: "",
      errorMessage: "There are not enough available slots for that request.",
    });
  }

  try {
    await Registration.create(buildRegistrationData(request, event, seatCount));
    event.availableSlots = event.availableSlots - seatCount;
    await event.save();

    response.redirect(
      "/events/registrations?message=Registration created successfully."
    );
  } catch (error) {
    response.status(400).render("registrationNewPage", {
      pageTitle: "Register For Event",
      event,
      formData,
      maxSeatCount: Math.min(10, event.availableSlots),
      message: "",
      errorMessage: "We could not create that registration. Please try again.",
    });
  }
});

// single event route
server.get("/events/:id", async (request, response) => {
  if (!hasValidId(request.params.id)) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  const event = await Event.findById(request.params.id);

  if (!event) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  let userRegistration = null;

  if (request.session.userId) {
    userRegistration = await Registration.findOne({
      userId: request.session.userId,
      eventId: event._id,
    });
  }

  response.render("eventShowPage", {
    pageTitle: event.title,
    event,
    userRegistration,
    message: request.query.message || "",
  });
});

// admin login page route
server.get("/admin/login", (request, response) => {
  if (request.session.isAdminLoggedIn) {
    return response.redirect("/admin/events");
  }

  response.render("adminLoginPage", {
    pageTitle: "Admin Login",
    errorMessage: "",
  });
});

// admin login route
server.post("/admin/login", (request, response) => {
  const { username, password } = request.body;

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    request.session.isAdminLoggedIn = true;
    return response.redirect("/admin/events");
  }

  response.status(401).render("adminLoginPage", {
    pageTitle: "Admin Login",
    errorMessage: "Incorrect username or password.",
  });
});

// admin logout route
server.post("/admin/logout", ensureAdmin, (request, response) => {
  delete request.session.isAdminLoggedIn;
  response.redirect("/admin/login");
});

// admin events page route
server.get("/admin/events", ensureAdmin, async (request, response) => {
  const events = await Event.find().sort({ date: 1 });

  response.render("adminEventsIndexPage", {
    pageTitle: "Manage Events",
    events,
    message: request.query.message || "",
  });
});

// admin new event page route
server.get("/admin/events/new", ensureAdmin, (request, response) => {
  response.render("adminEventsNewPage", {
    pageTitle: "Add New Event",
    formData: {
      title: "",
      date: "",
      location: "",
      category: "",
      image: "",
      description: "",
      availableSlots: "",
    },
    errorMessage: "",
  });
});

// admin create event route
server.post("/admin/events", ensureAdmin, async (request, response) => {
  const formData = buildEventData(request.body);

  try {
    await Event.create(formData);

    response.redirect("/admin/events?message=Event created successfully.");
  } catch (error) {
    response.status(400).render("adminEventsNewPage", {
      pageTitle: "Add New Event",
      formData: request.body,
      errorMessage: "Please complete every event field correctly.",
    });
  }
});

// admin edit event page route
server.get("/admin/events/:id/edit", ensureAdmin, async (request, response) => {
  if (!hasValidId(request.params.id)) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  const event = await Event.findById(request.params.id);

  if (!event) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  response.render("adminEventsEditPage", {
    pageTitle: "Edit Event",
    event,
    errorMessage: "",
  });
});

// admin update event route
server.patch("/admin/events/:id", ensureAdmin, async (request, response) => {
  if (!hasValidId(request.params.id)) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  const event = await Event.findById(request.params.id);

  if (!event) {
    return response.status(404).render("notFoundPage", {
      pageTitle: "Page Not Found",
    });
  }

  const formData = buildEventData(request.body);

  try {
    await Event.findByIdAndUpdate(request.params.id, formData, {
      runValidators: true,
    });

    response.redirect("/admin/events?message=Event updated successfully.");
  } catch (error) {
    response.status(400).render("adminEventsEditPage", {
      pageTitle: "Edit Event",
      event: {
        _id: request.params.id,
        ...request.body,
      },
      errorMessage: "Please complete every event field correctly.",
    });
  }
});

// admin delete event route
server.delete("/admin/events/:id", ensureAdmin, async (request, response) => {
  if (!hasValidId(request.params.id)) {
    return response.redirect("/admin/events?message=That event could not be found.");
  }

  await Registration.deleteMany({ eventId: request.params.id });
  await Event.findByIdAndDelete(request.params.id);

  response.redirect("/admin/events?message=Event deleted successfully.");
});

// 404 route
server.use((request, response) => {
  response.status(404).render("notFoundPage", {
    pageTitle: "Page Not Found",
  });
});

module.exports = server;
