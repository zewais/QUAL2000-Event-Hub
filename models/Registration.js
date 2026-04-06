const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const registrationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    eventTitle: {
      type: String,
      required: true,
      trim: true,
    },
    attendeeName: {
      type: String,
      required: true,
      trim: true,
    },
    attendeeEmail: {
      type: String,
      required: true,
      trim: true,
    },
    ticketCount: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    status: {
      type: String,
      required: true,
      default: "Confirmed",
      enum: ["Confirmed", "Cancelled"],
    },
  },
  { timestamps: true }
);

const Registration = mongoose.model(
  "Registration",
  registrationSchema,
  "registrations"
);

module.exports = Registration;
