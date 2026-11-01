// Đồng bộ MỘT CHIỀU từ website VietXO cũ (source v1.0.3) về phần mềm CSKH.
// Dùng đúng API của website: POST /api/auth/login → GET /api/workspace (bệnh nhân, lịch hẹn, bác sĩ, dịch vụ).
// Chỉ ĐỌC từ website; không ghi ngược vào hệ thống cũ. Nội dung chăm sóc/tư vấn/phiên dịch/ghi chú của CSKH
// không bao giờ bị ghi đè.

const TZ = "Asia/Ho_Chi_Minh";
const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const toLocal = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : fmt.format(d).replace(" ", "T"); };
const clip = (v, n = 300) => String(v ?? "").trim().slice(0, n);
const digits = (s) => String(s ?? "").replace(/\D/g, "");
const okId = (v) => typeof v === "string" && /^[\w:.\-]{1,40}$/.test(v);

// Trạng thái lịch hẹn của website (AppointmentStatus) → trạng thái rút gọn của CSKH.
const STATUS = { scheduled: "scheduled", confirmed: "confirmed", early: "confirmed", arrived: "confirmed", late: "confirmed", waiting: "confirmed", examining: "confirmed", completed: "completed", cancelled: "cancelled", no_show: "no_show" };
const GENDER = ["Nam", "Nữ", "Khác"];
const CUSTOMER_STATUS = ["Mới", "Đang điều trị", "Tái khám", "Hoàn tất"];

export function syncConfig(env = process.env) {
  const url = (env.VIETXO_URL || "").trim().replace(/\/+$/, "");
  const email = (env.VIETXO_EMAIL || "").trim();
  const password = env.VIETXO_PASSWORD || "";
  return { url, email, password, configured: Boolean(url && email && password) };
}

function assertSafeUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error("VIETXO_URL không hợp lệ."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) throw new Error("VIETXO_URL phải dùng https (chỉ localhost được dùng http) để không lộ mật khẩu.");
  return u;
}

async function fetchWorkspace(cfg) {
  const base = assertSafeUrl(cfg.url);
  const timeout = () => AbortSignal.timeout(30_000);
  const login = await fetch(`${base.origin}/api/auth/login`, {
    method: "POST", signal: timeout(),
    headers: { "Content-Type": "application/json", Origin: base.origin },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const lj = await login.json().catch(() => ({}));
  if (!login.ok) throw new Error(`Đăng nhập website VietXO thất bại (${login.status}): ${lj.error || "không rõ nguyên nhân"}`);
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const headers = { Accept: "application/json", Origin: base.origin, ...(cookie ? { Cookie: cookie } : {}), ...(lj.sessionToken ? { Authorization: `Bearer ${lj.sessionToken}` } : {}) };
  const ws = await fetch(`${base.origin}/api/workspace`, { headers, signal: timeout() });
  const wj = await ws.json().catch(() => ({}));
  if (!ws.ok) throw new Error(`Không đọc được dữ liệu website VietXO (${ws.status}): ${wj.error || ""}`);
  return wj;
}

// Tìm theo extId; nếu chưa có thì nhận lại bản ghi cục bộ cùng mã + cùng tên; trùng mã khác tên → mã "VX:<mã>".
function upsertRef(list, ext) {
  let e = list.find((x) => x.extId === ext.id);
  if (!e) {
    const local = list.find((x) => x.id === ext.id);
    if (local && !local.extId && local.name === ext.name) { e = local; e.extId = ext.id; }
    else { e = { id: local ? "VX:" + ext.id : ext.id, extId: ext.id }; list.push(e); }
  }
  e.name = ext.name;
  return e;
}

/** Trả về bản tóm tắt; sửa trực tiếp `db`. `newRecordId()` cấp mã CS-xxxx. */
export async function syncFromVietXo(db, cfg, newRecordId) {
  const ws = await fetchWorkspace(cfg);
  const sum = { at: new Date().toISOString(), doctors: 0, services: 0, customers: { created: 0, updated: 0, conflicts: 0 }, records: { created: 0, updated: 0, skipped: 0 } };

  for (const d of Array.isArray(ws.doctors) ? ws.doctors : []) {
    if (!okId(d?.id) || !clip(d.name)) continue;
    const e = upsertRef(db.doctors, { id: d.id, name: clip(d.name, 120) });
    e.name = clip(d.name, 120); e.specialty = clip(d.specialty, 120) || e.specialty || ""; sum.doctors++;
  }
  for (const s of Array.isArray(ws.services) ? ws.services : []) {
    if (!okId(s?.id) || !clip(s.name)) continue;
    upsertRef(db.services, { id: s.id, name: clip(s.name, 120) }); sum.services++;
  }
  const doctorOf = (extId) => db.doctors.find((x) => x.extId === extId)?.id || "";
  const serviceOf = (extId) => db.services.find((x) => x.extId === extId)?.id || "";

  const customerByExt = new Map();
  for (const p of Array.isArray(ws.patients) ? ws.patients : []) {
    if (!okId(p?.id) || !clip(p.name)) continue;
    let c = db.customers.find((x) => x.extId === p.id);
    const phone = clip(p.phone, 30);
    if (!c) {
      const local = db.customers.find((x) => x.id === p.id);
      if (local) {
        if (!local.extId && local.name === clip(p.name, 120) && digits(local.phone) === digits(phone)) { c = local; c.extId = p.id; }
        else { sum.customers.conflicts++; continue; } // trùng mã với khách nhập tay khác người — không ghi đè
      } else {
        c = { id: p.id, extId: p.id, name: "", phone: "", gender: "Khác", birthYear: 0, email: "", address: "", source: "Website VietXO", doctorId: "", status: "Mới", note: clip(p.note, 2000) };
        db.customers.push(c); sum.customers.created++;
      }
    } else sum.customers.updated++;
    c.name = clip(p.name, 120); c.phone = phone || c.phone;
    c.gender = GENDER.includes(p.gender) ? p.gender : c.gender;
    const y = Number(p.birthYear) || Number(String(p.birthDate || "").slice(0, 4)) || 0;
    c.birthYear = y >= 1900 && y <= new Date().getFullYear() ? y : c.birthYear;
    c.email = clip(p.email, 120) || c.email;
    c.status = CUSTOMER_STATUS.includes(p.status) ? p.status : c.status;
    c.doctorId = doctorOf(p.doctorId) || c.doctorId;
    customerByExt.set(p.id, c.id);
  }

  for (const a of Array.isArray(ws.appointments) ? ws.appointments : []) {
    const at = toLocal(a?.startAt);
    const customerId = customerByExt.get(a?.patientId) || db.customers.find((x) => x.extId === a?.patientId)?.id;
    if (!okId(a?.id) || !at || !customerId) { sum.records.skipped++; continue; }
    const fields = { appointmentAt: at, doctorId: doctorOf(a.doctorId), serviceId: serviceOf(a.serviceId), status: STATUS[a.status] || "scheduled" };
    const rec = db.records.find((x) => x.extId === a.id);
    if (!rec) {
      const now = new Date().toISOString();
      db.records.unshift({ id: newRecordId(), extId: a.id, customerId, consultAt: "", interpreter: "", careContent: "", consultContent: "", note: clip(a.note, 2000), ...fields, createdAt: now, updatedAt: now });
      sum.records.created++;
    } else if (Object.entries(fields).some(([k, v]) => rec[k] !== v)) {
      Object.assign(rec, fields, { updatedAt: new Date().toISOString() }); sum.records.updated++;
    }
  }
  return sum;
}
