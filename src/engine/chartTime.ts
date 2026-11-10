import { CONFIG } from './config';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** When the railway prepares the reservation chart for a train departing at `departure` (ISO). */
export function chartTime(departure: string): string {
  const { timezoneOffsetMinutes: tz, chart } = CONFIG;
  const dep = new Date(departure).getTime();
  const local = new Date(dep + tz * MIN); // read UTC getters as IST wall clock
  const minutesOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();

  if (minutesOfDay >= chart.morningStartMinutes && minutesOfDay < chart.morningEndMinutes) {
    const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - tz * MIN;
    return new Date(localMidnight - (24 - chart.morningChartHourPrevDay) * HOUR).toISOString();
  }
  return new Date(dep - chart.defaultHoursBefore * HOUR).toISOString();
}
