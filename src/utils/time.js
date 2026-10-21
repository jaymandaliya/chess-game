// India has no DST, so IST is a fixed +05:30 offset
const IST_OFFSET_MS = 330 * 60 * 1000;

function startOfDayIST(date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

function daysAgo(days, from = new Date()) {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

module.exports = { startOfDayIST, daysAgo };
