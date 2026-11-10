// Every tunable number for the engine lives here.
export const CONFIG = {
  // All wall-clock rules (chart time) use Indian Standard Time.
  timezoneOffsetMinutes: 330,

  chart: {
    morningStartMinutes: 5 * 60, // 05:00 inclusive
    morningEndMinutes: 14 * 60, // 14:00 exclusive
    morningChartHourPrevDay: 21,
    defaultHoursBefore: 8,
  },

  eligibility: {
    classes: ['1A', '2A', '3A'] as const,
    minDaysBookedBeforeTravel: 3,
    minConfirmChanceAtBooking: 0.25,
    minHoursBeforeChart: 2,
    maxWinsPerTravellerPerYear: 4,
    maxStationToAirportKm: 200,
  },

  matching: {
    bufferHoursAfterResult: 3, // on top of station-to-airport travel time
  },

  market: {
    commissionRate: 0.08,
  },

  payments: {
    depositRate: 0.2, // deposit block = 20% of max price × seats
  },
};
