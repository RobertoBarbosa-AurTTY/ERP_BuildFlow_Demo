// Helpers de validação e sanitização de entrada das Netlify Functions.
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function sanitizeString(v, max = 200) {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") v = String(v);
  return v.trim().slice(0, max);
}

function sanitizeOptionalString(v, max = 200) {
  const s = sanitizeString(v, max);
  return s === "" ? null : s;
}

function toFiniteNumber(v) {
  if (v === undefined || v === null || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function toPositiveNumber(v, fallback = null) {
  const n = toFiniteNumber(v);
  return n !== null && Number.isFinite(n) && n > 0 ? n : fallback;
}

function isObjectId(v) {
  return typeof v === "string" && OBJECT_ID_RE.test(v);
}

function isDateString(v) {
  if (typeof v !== "string" || v.trim() === "") return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

function toDate(v) {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sanitizeArray(v, max = 100) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max);
}

// Parse seguro do corpo da requisição. Retorna { error } em caso de falha.
function parseBody(event, maxBytes = 2 * 1024 * 1024) {
  if (!event.body) return { error: "Corpo da requisição ausente" };
  if (Buffer.byteLength(event.body, "utf8") > maxBytes) {
    return { error: "Corpo da requisição excede o limite permitido" };
  }
  try {
    const parsed = JSON.parse(event.body);
    if (!isPlainObject(parsed) && !Array.isArray(parsed)) {
      return { error: "JSON inválido: esperado objeto ou array" };
    }
    return { value: parsed };
  } catch {
    return { error: "JSON inválido" };
  }
}

// Lista os campos obrigatórios ausentes.
function missingFields(body, fields) {
  return fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
}

module.exports = {
  isPlainObject,
  sanitizeString,
  sanitizeOptionalString,
  toFiniteNumber,
  toPositiveNumber,
  isObjectId,
  isDateString,
  toDate,
  sanitizeArray,
  parseBody,
  missingFields,
};
