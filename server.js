// Phần mềm chăm sóc khách hàng — Nha khoa Quốc tế Việt Xô
// Không cần cài thư viện: chỉ cần Node.js >= 18. Chạy: node server.js
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { buildXlsx } from "./xlsx.js";
import { syncConfig, syncFromVietXo } from "./vietxo-sync.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DEMO = process.env.DEMO === "1"; // chế độ xem thử: CSDL riêng + tài khoản mẫu, không đụng dữ liệu thật
const DB_FILE = path.join(ROOT, "data", DEMO ? "demo-db.json" : "db.json");
const PORT = Number(process.env.PORT || 3100);

// Trạng thái lịch hẹn lấy theo AppointmentStatus của source VietXO (rút gọn).
const APPT_STATUS = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];
const CUSTOMER_STATUS = ["Mới", "Đang điều trị", "Tái khám", "Hoàn tất"];

function seed() {
  const doctors = [
    { id: "BS-001", name: "BS. Phạm Thu Hà", specialty: "Nội nha · Thẩm mỹ" },
    { id: "BS-002", name: "BS. Đỗ Anh Tuấn", specialty: "Implant · Tiểu phẫu" },
    { id: "BS-003", name: "BS. Lê Minh Khang", specialty: "Chỉnh nha" },
    { id: "BS-004", name: "BS. Nguyễn Quốc Huy", specialty: "Nha khoa tổng quát" },
    { id: "BS-005", name: "BS. Vũ Diệu Linh", specialty: "Nha khoa trẻ em" },
    { id: "BS-006", name: "BS. Trần Minh Tâm", specialty: "Phục hình răng" },
  ];
  const services = [
    "Khám tổng quát", "Cạo vôi & đánh bóng", "Trám răng thẩm mỹ", "Trám răng sữa",
    "Điều trị tủy", "Nhổ răng khôn", "Tẩy trắng răng", "Tư vấn niềng răng",
    "Chỉnh nha mắc cài", "Phục hình Implant", "Bọc răng sứ", "Dán sứ Veneer",
  ].map((name, i) => ({ id: "DV-" + String(i + 1).padStart(3, "0"), name }));
  const sources = ["Tái khám", "Facebook", "Website", "TikTok", "Instagram", "Giới thiệu", "Zalo", "Khác"];

  const customers = [
    { id: "KH-00001", name: "Nguyễn Minh Anh", phone: "0914 886 220", gender: "Nữ", birthYear: 1992, email: "", address: "", source: "Tái khám", doctorId: "BS-001", status: "Đang điều trị", note: "Dị ứng Lidocaine — kiểm tra trước khi gây tê." },
    { id: "KH-00002", name: "Ngô Mỹ Duyên", phone: "0909 332 806", gender: "Nữ", birthYear: 2001, email: "", address: "", source: "TikTok", doctorId: "BS-003", status: "Mới", note: "" },
    { id: "KH-00003", name: "Võ Thị Ngọc Mai", phone: "0938 142 907", gender: "Nữ", birthYear: 1985, email: "", address: "", source: "Giới thiệu", doctorId: "BS-002", status: "Đang điều trị", note: "Còn công nợ 12.500.000đ." },
    { id: "KH-00004", name: "Lê Hoàng Nam", phone: "0903 777 514", gender: "Nam", birthYear: 1997, email: "", address: "", source: "Facebook", doctorId: "BS-003", status: "Tái khám", note: "" },
    { id: "KH-00005", name: "Đỗ Khánh Linh", phone: "0987 506 431", gender: "Nữ", birthYear: 2017, email: "", address: "", source: "Giới thiệu", doctorId: "BS-005", status: "Đang điều trị", note: "Phụ huynh ưu tiên lịch sáng thứ Bảy." },
  ];

  const day = (offset, hh, mm) => {
    const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hh, mm, 0, 0);
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(hh)}:${z(mm)}`;
  };
  const records = [
    { id: "CS-0001", customerId: "KH-00001", appointmentAt: day(0, 15, 0), consultAt: day(0, 16, 0), doctorId: "BS-001", serviceId: "DV-005", status: "confirmed", careContent: "Gọi nhắc lịch hẹn hàn ống tủy, nhắc ăn nhẹ trước khi đến.", consultContent: "Tư vấn bọc sứ R26 sau khi hoàn tất điều trị tủy.", note: "Khách muốn lịch sau 15h." },
    { id: "CS-0002", customerId: "KH-00002", appointmentAt: day(1, 10, 0), doctorId: "BS-003", serviceId: "DV-008", status: "scheduled", careContent: "Gửi Zalo xác nhận lịch tư vấn niềng răng.", consultContent: "Khách quan tâm niềng răng mắc cài, hỏi chi phí và thời gian điều trị.", note: "" },
    { id: "CS-0003", customerId: "KH-00003", appointmentAt: day(3, 9, 0), consultAt: day(2, 15, 0), interpreter: "Nguyễn Thị Lan (tiếng Nga)", doctorId: "BS-002", serviceId: "DV-010", status: "scheduled", careContent: "Nhắc lịch lắp răng tạm và hướng dẫn vệ sinh sau cấy ghép.", consultContent: "Tư vấn kế hoạch thanh toán phần công nợ còn lại.", note: "" },
    { id: "CS-0004", customerId: "KH-00004", appointmentAt: day(-2, 14, 0), doctorId: "BS-003", serviceId: "DV-009", status: "completed", careContent: "Hỏi thăm tình trạng ê buốt sau siết dây cung, khách ổn.", consultContent: "Hướng dẫn dùng chỉ nha khoa và bàn chải kẽ.", note: "Hẹn tái khám 4 tuần." },
    { id: "CS-0005", customerId: "KH-00005", appointmentAt: day(-5, 9, 30), doctorId: "BS-005", serviceId: "DV-004", status: "no_show", careContent: "Gọi 2 lần không bắt máy, đã nhắn Zalo.", consultContent: "", note: "Gọi lại buổi tối để đặt lịch mới." },
  ].map((r) => ({ ...r, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

  return { doctors, services, sources, customers, records, seq: { customer: 5, record: 5 } };
}

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    const db = seed();
    saveDb(db);
    return db;
  }
}
function saveDb(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const db = loadDb();
// Mã bệnh nhân đổi tiền tố KH- → BN- (theo source VietXO); chuyển dữ liệu cũ một lần.
if (db.customers.some((c) => c.id.startsWith("KH-"))) {
  const bn = (id) => id.replace(/^KH-/, "BN-");
  db.customers.forEach((c) => { c.id = bn(c.id); });
  db.records.forEach((r) => { r.customerId = bn(r.customerId); });
  saveDb(db);
}
const str = (v, max = 2000) => String(v ?? "").trim().slice(0, max);

/* ---------- Đăng nhập & phân quyền ---------- */
const ROLES = ["admin", "cskh", "doctor"]; // quản trị · chăm sóc khách hàng · bác sĩ
const SESSION_MS = 12 * 3600 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function verifyPassword(user, password) {
  const a = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  return crypto.timingSafeEqual(a, Buffer.from(user.hash, "hex"));
}

if (!db.secret) { db.secret = crypto.randomBytes(32).toString("hex"); saveDb(db); }
if (!db.users) db.users = [];
if (DEMO && !db.users.length) {
  const mk = (id, username, name, role, doctorId) => ({ id, username, name, role, doctorId, active: true, ...hashPassword("demo1234") });
  db.users.push(mk("ND-001", "admin", "Quản trị viên", "admin", ""), mk("ND-002", "cskh", "Nhân viên CSKH", "cskh", ""), mk("ND-003", "bacsi", "BS. Phạm Thu Hà", "doctor", "BS-001"));
  saveDb(db);
}
if (!db.users.length) {
  const password = crypto.randomBytes(9).toString("base64url");
  db.users.push({ id: "ND-001", username: "admin", name: "Quản trị viên", role: "admin", doctorId: "", active: true, ...hashPassword(password) });
  saveDb(db);
  console.log("\n=== Đã tạo tài khoản quản trị lần đầu ===\n  Tên đăng nhập: admin\n  Mật khẩu:      " + password + "\n  Hãy đăng nhập và đổi mật khẩu ngay.\n");
}

const sign = (payload) => crypto.createHmac("sha256", db.secret).update(payload).digest("base64url");
function makeToken(uid) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + SESSION_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function authUser(req) {
  const m = /(?:^|;\s*)cskh_session=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload)), got = Buffer.from(sig);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (exp < Date.now()) return null;
    const u = db.users.find((x) => x.id === uid);
    return u && u.active ? u : null;
  } catch { return null; }
}
const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, doctorId: u.doctorId, active: u.active });
const cookie = (value, maxAge) => `cskh_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

// Chống dò mật khẩu: 5 lần sai liên tiếp → khóa 5 phút (theo IP + tên đăng nhập).
const attempts = new Map();
function checkLock(key) {
  const a = attempts.get(key);
  if (a && a.until > Date.now()) throw httpError(429, "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau vài phút.");
}
function noteFail(key) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n += 1; if (a.n >= 5) { a.until = Date.now() + 5 * 60_000; a.n = 0; }
  attempts.set(key, a);
}

function cleanPassword(p) {
  if (typeof p !== "string" || p.length < 8 || p.length > 128) throw httpError(400, "Mật khẩu phải từ 8 đến 128 ký tự.");
  return p;
}
const activeAdmins = (exceptId) => db.users.filter((u) => u.role === "admin" && u.active && u.id !== exceptId).length;

function cleanCustomer(b) {
  const name = str(b.name, 120);
  if (!name) throw httpError(400, "Vui lòng nhập họ tên khách hàng.");
  const phone = str(b.phone, 30);
  if (!phone) throw httpError(400, "Vui lòng nhập số điện thoại.");
  const year = Number(b.birthYear) || 0;
  return {
    name, phone,
    gender: ["Nam", "Nữ", "Khác"].includes(b.gender) ? b.gender : "Khác",
    birthYear: year >= 1900 && year <= new Date().getFullYear() ? year : 0,
    email: str(b.email, 120), address: str(b.address, 300),
    source: str(b.source, 60),
    doctorId: db.doctors.some((d) => d.id === b.doctorId) ? b.doctorId : "",
    status: CUSTOMER_STATUS.includes(b.status) ? b.status : "Mới",
    note: str(b.note),
  };
}

function cleanRecord(b) {
  if (!db.customers.some((c) => c.id === b.customerId)) throw httpError(400, "Khách hàng không tồn tại.");
  const appointmentAt = str(b.appointmentAt, 20);
  if (appointmentAt && Number.isNaN(Date.parse(appointmentAt))) throw httpError(400, "Lịch hẹn không hợp lệ.");
  const consultAt = str(b.consultAt, 20);
  if (consultAt && Number.isNaN(Date.parse(consultAt))) throw httpError(400, "Lịch hẹn tư vấn không hợp lệ.");
  return {
    customerId: b.customerId,
    appointmentAt,
    consultAt,
    doctorId: db.doctors.some((d) => d.id === b.doctorId) ? b.doctorId : "",
    serviceId: db.services.some((s) => s.id === b.serviceId) ? b.serviceId : "",
    status: APPT_STATUS.includes(b.status) ? b.status : "scheduled",
    interpreter: str(b.interpreter, 120),
    careContent: str(b.careContent),
    consultContent: str(b.consultContent),
    note: str(b.note),
  };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw httpError(413, "Dữ liệu quá lớn.");
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw httpError(400, "JSON không hợp lệ."); }
}

// Bỏ qua mã đã tồn tại (khách đồng bộ từ website VietXO có thể đã dùng sẵn mã BN-xxxxx).
function nextId(kind, prefix, pad, list) {
  let id;
  do id = `${prefix}-${String(++db.seq[kind]).padStart(pad, "0")}`; while (list.some((x) => x.id === id));
  return id;
}

/* ---------- Xuất Excel ---------- */
const STATUS_LABEL = { scheduled: "Đã đặt lịch", confirmed: "Đã xác nhận", completed: "Hoàn tất", cancelled: "Đã hủy", no_show: "Không đến" };
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}${s.length > 10 ? " " + s.slice(11, 16) : ""}` : "");
function exportWorkbook(type, ids) {
  const set = new Set(Array.isArray(ids) ? ids.slice(0, 50000).map(String) : []);
  const doc = (id) => db.doctors.find((d) => d.id === id)?.name || "";
  if (type === "customers") {
    const rows = db.customers.filter((c) => set.has(c.id)).map((c) => [c.id, c.name, c.phone, c.gender, c.birthYear || "", c.email, c.address, c.source, doc(c.doctorId), c.status, c.note]);
    return buildXlsx("Bệnh nhân", ["Mã BN", "Họ tên", "Điện thoại", "Giới tính", "Năm sinh", "Email", "Địa chỉ", "Nguồn", "Bác sĩ phụ trách", "Trạng thái", "Ghi chú"], rows, [12, 26, 16, 10, 10, 24, 30, 16, 24, 16, 40]);
  }
  const rows = db.records.filter((r) => set.has(r.id)).map((r) => {
    const c = db.customers.find((x) => x.id === r.customerId);
    return [r.customerId, c?.name || "", c?.phone || "", dmy(r.appointmentAt), dmy(r.consultAt), doc(r.doctorId), db.services.find((s) => s.id === r.serviceId)?.name || "",
      STATUS_LABEL[r.status] || r.status, r.interpreter || "", r.careContent, r.consultContent, r.note];
  });
  return buildXlsx("Lịch hẹn & chăm sóc", ["Mã BN", "Họ tên", "Điện thoại", "Lịch hẹn", "Lịch hẹn tư vấn", "Bác sĩ", "Dịch vụ", "Trạng thái", "Phiên dịch viên", "Nội dung chăm sóc", "Nội dung tư vấn", "Ghi chú"], rows, [12, 26, 16, 18, 18, 24, 26, 14, 22, 44, 44, 36]);
}

/* ---------- Đồng bộ website VietXO ---------- */
let syncing = false;
async function runSync() {
  const cfg = syncConfig();
  if (!cfg.configured) throw httpError(400, "Chưa cấu hình VIETXO_URL, VIETXO_EMAIL, VIETXO_PASSWORD.");
  if (syncing) throw httpError(409, "Đang đồng bộ, vui lòng đợi.");
  syncing = true;
  try {
    const sum = await syncFromVietXo(db, cfg, () => nextId("record", "CS", 4, db.records));
    db.lastSync = { ok: true, ...sum };
    saveDb(db); return db.lastSync;
  } catch (e) {
    db.lastSync = { ok: false, at: new Date().toISOString(), error: String(e.message || e).slice(0, 300) };
    saveDb(db); throw httpError(502, db.lastSync.error);
  } finally { syncing = false; }
}
const syncMinutes = Number(process.env.SYNC_INTERVAL_MIN || 0);
if (syncMinutes > 0 && syncConfig().configured) setInterval(() => runSync().catch((e) => console.error("Đồng bộ tự động lỗi:", e.message)), syncMinutes * 60_000);

async function api(req, res, url) {
  const parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const [res1, id] = parts;
  const m = req.method;
  const send = (data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  };

  if (m !== "GET" && req.headers["x-requested-with"] !== "cskh") throw httpError(403, "Yêu cầu không hợp lệ.");

  if (res1 === "demo" && m === "GET") return send({ demo: DEMO });
  if (res1 === "login" && m === "POST") {
    const b = await readBody(req);
    const username = str(b.username, 60).toLowerCase();
    const key = `${req.socket.remoteAddress}|${username}`;
    checkLock(key);
    const u = db.users.find((x) => x.username === username && x.active);
    if (!u || !verifyPassword(u, String(b.password ?? ""))) { noteFail(key); throw httpError(401, "Sai tên đăng nhập hoặc mật khẩu."); }
    attempts.delete(key);
    res.setHeader("Set-Cookie", cookie(makeToken(u.id), SESSION_MS / 1000));
    return send(publicUser(u));
  }
  if (res1 === "logout" && m === "POST") {
    res.setHeader("Set-Cookie", cookie("", 0));
    return send({ ok: true });
  }

  const me = authUser(req);
  if (!me) throw httpError(401, "Vui lòng đăng nhập.");
  const canEdit = me.role === "admin" || me.role === "cskh"; // bác sĩ chỉ xem hồ sơ và ghi lịch/chăm sóc

  if (res1 === "me" && m === "GET") return send(publicUser(me));
  if (res1 === "password" && m === "POST") {
    const b = await readBody(req);
    if (!verifyPassword(me, String(b.current ?? ""))) throw httpError(400, "Mật khẩu hiện tại không đúng.");
    Object.assign(me, hashPassword(cleanPassword(b.next)));
    saveDb(db); return send({ ok: true });
  }

  if (res1 === "users") {
    if (me.role !== "admin") throw httpError(403, "Chỉ quản trị viên được quản lý tài khoản.");
    if (m === "GET") return send(db.users.map(publicUser));
    const body = m === "DELETE" ? {} : await readBody(req);
    const fields = () => {
      const name = str(body.name, 120);
      if (!name) throw httpError(400, "Vui lòng nhập họ tên.");
      if (!ROLES.includes(body.role)) throw httpError(400, "Vai trò không hợp lệ.");
      return { name, role: body.role, doctorId: db.doctors.some((d) => d.id === body.doctorId) ? body.doctorId : "" };
    };
    if (m === "POST") {
      const username = str(body.username, 60).toLowerCase();
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw httpError(400, "Tên đăng nhập 3–40 ký tự: chữ thường, số, . _ -");
      if (db.users.some((u) => u.username === username)) throw httpError(409, "Tên đăng nhập đã tồn tại.");
      const n = db.users.reduce((mx, u) => Math.max(mx, Number(u.id.slice(3))), 0) + 1;
      const u = { id: "ND-" + String(n).padStart(3, "0"), username, ...fields(), active: true, ...hashPassword(cleanPassword(body.password)) };
      db.users.push(u); saveDb(db); return send(publicUser(u), 201);
    }
    const u = db.users.find((x) => x.id === id);
    if (!u) throw httpError(404, "Không tìm thấy tài khoản.");
    if (m === "PUT") {
      const f = fields(); const active = body.active !== false;
      if ((u.role === "admin" && u.active) && (f.role !== "admin" || !active) && !activeAdmins(u.id)) throw httpError(400, "Phải còn ít nhất một quản trị viên hoạt động.");
      Object.assign(u, f, { active });
      if (body.password) Object.assign(u, hashPassword(cleanPassword(body.password)));
      saveDb(db); return send(publicUser(u));
    }
    if (m === "DELETE") {
      if (u.id === me.id) throw httpError(400, "Không thể xóa chính tài khoản đang đăng nhập.");
      if (u.role === "admin" && u.active && !activeAdmins(u.id)) throw httpError(400, "Phải còn ít nhất một quản trị viên hoạt động.");
      db.users = db.users.filter((x) => x.id !== id); saveDb(db); return send({ ok: true });
    }
  }

  if (res1 === "export" && m === "POST") {
    const b = await readBody(req);
    const file = exportWorkbook(b.type === "customers" ? "customers" : "records", b.ids);
    res.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Length": file.length, "Cache-Control": "no-store" });
    return res.end(file);
  }
  if (res1 === "sync") {
    if (me.role !== "admin") throw httpError(403, "Chỉ quản trị viên được đồng bộ.");
    if (m === "GET") { const c = syncConfig(); return send({ configured: c.configured, url: c.url, last: db.lastSync || null }); }
    if (m === "POST") return send(await runSync());
  }

  if (res1 === "bootstrap" && m === "GET") {
    return send({ doctors: db.doctors, services: db.services, sources: db.sources, customers: db.customers, records: db.records });
  }
  if (res1 === "customers") {
    if (!canEdit) throw httpError(403, "Bạn không có quyền thay đổi hồ sơ khách hàng.");
    if (m === "POST") {
      const c = { id: nextId("customer", "BN", 5, db.customers), ...cleanCustomer(await readBody(req)) };
      db.customers.unshift(c); saveDb(db); return send(c, 201);
    }
    const idx = db.customers.findIndex((c) => c.id === id);
    if (idx < 0) throw httpError(404, "Không tìm thấy khách hàng.");
    if (m === "PUT") {
      db.customers[idx] = { ...db.customers[idx], ...cleanCustomer(await readBody(req)) };
      saveDb(db); return send(db.customers[idx]);
    }
    if (m === "DELETE") {
      db.customers.splice(idx, 1);
      db.records = db.records.filter((r) => r.customerId !== id);
      saveDb(db); return send({ ok: true });
    }
  }
  if (res1 === "records") {
    if (m === "POST") {
      const now = new Date().toISOString();
      const r = { id: nextId("record", "CS", 4, db.records), ...cleanRecord(await readBody(req)), createdAt: now, updatedAt: now };
      db.records.unshift(r); saveDb(db); return send(r, 201);
    }
    const idx = db.records.findIndex((r) => r.id === id);
    if (idx < 0) throw httpError(404, "Không tìm thấy bản ghi chăm sóc.");
    if (m === "PUT") {
      db.records[idx] = { ...db.records[idx], ...cleanRecord(await readBody(req)), updatedAt: new Date().toISOString() };
      saveDb(db); return send(db.records[idx]);
    }
    if (m === "DELETE") {
      if (!canEdit) throw httpError(403, "Bạn không có quyền xóa.");
      db.records.splice(idx, 1); saveDb(db); return send({ ok: true }); }
  }
  throw httpError(404, "Không tìm thấy API.");
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: status === 500 ? "Lỗi máy chủ." : e.message }));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Việt Xô CSKH chạy tại http://localhost:${PORT}`));
