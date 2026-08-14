// Lógica compartilhada de período/fuso para relatórios financeiros.
// Usada por financial-report (fluxo de caixa/DRE) e financial-detail (drill-down).
const PROJECTION_DAYS = 30;

function tzOffsetToTimezone(tzOffset) {
  const total = parseInt(tzOffset, 10) || 0;
  const sign = total >= 0 ? "+" : "-";
  const abs = Math.abs(total);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayKey(date, tzOffset) {
  const local = new Date(date.getTime() + (parseInt(tzOffset, 10) || 0) * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * Calcula a janela de um período (day/week/month) e o início do dia local.
 * Retorna { processRangeStart, processRangeEnd, todayStart, todayKey }.
 */
function getPeriodRange({ period = "month", tzOffset = 0, selectedDate } = {}) {
  tzOffset = parseInt(tzOffset, 10) || 0;

  const now = new Date();
  const localEpoch = now.getTime() + tzOffset * 60000;
  const localDate = new Date(localEpoch);
  const localMidnightEpoch = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate());
  const todayStart = new Date(localMidnightEpoch - tzOffset * 60000);

  let rangeStart, rangeEnd;
  if (period === "day") {
    let dayStart;
    if (selectedDate) {
      const [y, m, d] = String(selectedDate).split("-").map(Number);
      dayStart = new Date(Date.UTC(y, m - 1, d) - tzOffset * 60000);
    } else {
      dayStart = new Date(todayStart);
    }
    rangeStart = dayStart;
    rangeEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  } else if (period === "week") {
    rangeStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    rangeEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  } else {
    rangeStart = new Date(Date.UTC(todayStart.getFullYear(), todayStart.getMonth(), 1) - tzOffset * 60000);
    rangeEnd = new Date(Date.UTC(todayStart.getFullYear(), todayStart.getMonth() + 1, 1) - tzOffset * 60000);
  }

  return {
    rangeStart,
    rangeEnd,
    todayStart,
    todayKey: dayKey(todayStart, tzOffset),
  };
}

module.exports = {
  PROJECTION_DAYS,
  tzOffsetToTimezone,
  addDays,
  dayKey,
  getPeriodRange,
};