const STATUS = {
  scheduled: ["Đã đặt lịch", ""], confirmed: ["Đã xác nhận", "ok"], completed: ["Hoàn tất", "gray"],
  cancelled: ["Đã hủy", "bad"], no_show: ["Không đến", "warn"],
};
const CUSTOMER_STATUS = ["Mới", "Đang điều trị", "Tái khám", "Hoàn tất"];
const TITLES = {
  dashboard: ["Tổng quan chăm sóc", "Lịch hẹn và khách cần chăm sóc trong ngày"],
  appointments: ["Lịch hẹn", "Theo dõi lịch hẹn của khách hàng theo thời gian"],
  care: ["Chăm sóc & tư vấn", "Nội dung chăm sóc, tư vấn và ghi chú cho từng khách hàng"],
  customers: ["Khách hàng", "Hồ sơ khách hàng và lịch sử chăm sóc"],
  users: ["Tài khoản & đồng bộ", "Quản lý người dùng, phân quyền và đồng bộ với website VietXO"],
};
const ROLE_LABEL = { admin: "Quản trị", cskh: "Chăm sóc khách hàng", doctor: "Bác sĩ" };
let me = null;
let users = [];
const canEdit = () => me && me.role !== "doctor"; // bác sĩ không sửa hồ sơ khách / không xóa

let data = { doctors: [], services: [], sources: [], customers: [], records: [] };
let view = "dashboard";
let returnTo = null; // mở lại hồ sơ khách sau khi lưu bản ghi từ trong hồ sơ
// bn / phone / from / to dùng chung cho Lịch hẹn, Chăm sóc & tư vấn (và bn / phone cho Khách hàng).
const filters = { apptRange: "upcoming", apptType: "all", apptDoctor: "", apptStatus: "", careQ: "", custQ: "", custStatus: "", bn: "", phone: "", from: "", to: "" };
let shown = { type: "records", ids: [] }; // danh sách đang hiển thị — dùng cho nút Xuất Excel
let syncInfo = null;

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nl = (v) => esc(v) || '<span class="muted">—</span>';
const customer = (id) => data.customers.find((c) => c.id === id);
const doctor = (id) => data.doctors.find((d) => d.id === id);
const service = (id) => data.services.find((s) => s.id === id);
const pad = (n) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = (s) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");
const fmtDT = (s, empty = "Chưa đặt lịch") => (s ? `${s.slice(11, 16)} · ${fmtDate(s)}` : empty);
const digits = (s) => String(s ?? "").replace(/\D/g, "");
const badge = (st) => `<span class="badge ${STATUS[st]?.[1] || ""}">${STATUS[st]?.[0] || st}</span>`;
const byAppt = (a, b) => (a.appointmentAt || "9").localeCompare(b.appointmentAt || "9");
const options = (list, sel, blank) =>
  (blank ? `<option value="">${blank}</option>` : "") +
  list.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(l)}</option>`).join("");

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-Requested-With": "cskh" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== "/api/login") { showLogin(); throw new Error(json.error || "Phiên đăng nhập đã hết hạn."); }
  if (!res.ok) throw new Error(json.error || "Có lỗi xảy ra.");
  return json;
}
async function reload() {
  data = await api("GET", "/api/bootstrap");
  if (me.role === "admin") { users = await api("GET", "/api/users"); syncInfo = await api("GET", "/api/sync"); }
  render();
}

async function exportXlsx() {
  if (!shown.ids.length) return toast("Không có dữ liệu để xuất.", true);
  try {
    const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "cskh" }, body: JSON.stringify(shown) });
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Không xuất được file.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = `CSKH-Viet-Xo-${shown.type === "customers" ? "benh-nhan" : "lich-hen"}-${today()}.xlsx`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`Đã xuất ${shown.ids.length} dòng ra Excel.`);
  } catch (err) { toast(err.message, true); }
}

function showLogin() {
  me = null; closeModal();
  $("#login").hidden = false; $("#loginErr").textContent = ""; $("#lp").value = ""; $("#lu").focus();
}
function applyRole() {
  $("#login").hidden = true;
  $("#me").hidden = false;
  $("#meName").textContent = me.name;
  $("#meRole").textContent = ROLE_LABEL[me.role];
  $("#navUsers").hidden = me.role !== "admin";
  $("#newCustomer").hidden = !canEdit();
  if (view === "users" && me.role !== "admin") view = "dashboard";
}
async function boot() {
  try { me = await api("GET", "/api/me"); } catch { return; }
  applyRole(); await reload();
}
let toastTimer;
function toast(msg, err) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/* ---------- Views ---------- */
function recordRows(list, { withCustomer = true } = {}) {
  if (!list.length) return `<div class="empty">Chưa có dữ liệu.</div>`;
  return `<div class="table-wrap"><table><thead><tr>
    ${withCustomer ? "<th>Mã BN</th><th>Khách hàng</th>" : ""}<th>Lịch hẹn</th><th>Lịch hẹn tư vấn</th><th>Bác sĩ · Dịch vụ</th><th>Phiên dịch viên</th><th>Trạng thái</th>
    <th>Nội dung chăm sóc</th><th>Tư vấn</th><th>Ghi chú</th><th></th></tr></thead><tbody>
    ${list.map((r) => {
      const c = customer(r.customerId);
      return `<tr>
        ${withCustomer ? `<td>${esc(r.customerId)}</td><td><a href="#" data-cust="${esc(r.customerId)}"><b>${esc(c?.name || "—")}</b></a><div class="muted">${esc(c?.phone || "")}</div></td>` : ""}
        <td>${esc(fmtDT(r.appointmentAt))}</td>
        <td>${r.consultAt ? esc(fmtDT(r.consultAt)) : '<span class="muted">—</span>'}</td>
        <td>${esc(doctor(r.doctorId)?.name || "—")}<div class="muted">${esc(service(r.serviceId)?.name || "")}</div></td>
        <td>${nl(r.interpreter)}</td>
        <td>${badge(r.status)}</td>
        <td class="clip">${nl(r.careContent)}</td><td class="clip">${nl(r.consultContent)}</td><td class="clip">${nl(r.note)}</td>
        <td><button class="btn sm" data-edit-rec="${r.id}">Sửa</button> ${canEdit() ? `<button class="btn sm danger" data-del-rec="${r.id}">Xóa</button>` : ""}</td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
}

function dashboardView() {
  const t = today();
  const active = data.records.filter((r) => r.status === "scheduled" || r.status === "confirmed");
  const todayList = data.records.filter((r) => r.appointmentAt.startsWith(t) && r.status !== "cancelled").sort(byAppt);
  const week = active.filter((r) => r.appointmentAt.slice(0, 10) > t && r.appointmentAt.slice(0, 10) <= addDays(7));
  const unconfirmed = active.filter((r) => r.status === "scheduled" && r.appointmentAt.slice(0, 10) <= addDays(2) && r.appointmentAt.slice(0, 10) >= t);
  const consults = data.records.filter((r) => r.consultAt && r.consultAt.slice(0, 10) >= t && r.consultAt.slice(0, 10) <= addDays(7) && r.status !== "cancelled")
    .sort((a, b) => a.consultAt.localeCompare(b.consultAt));
  const consultToday = consults.filter((r) => r.consultAt.startsWith(t)).length;
  const recall = data.records.filter((r) => r.status === "no_show" || r.status === "cancelled").sort(byAppt).reverse();
  const item = (r, right) => {
    const c = customer(r.customerId);
    return `<div class="item"><div class="time">${esc(r.appointmentAt ? r.appointmentAt.slice(11, 16) : "—")}</div>
      <div style="flex:1"><a href="#" data-cust="${esc(r.customerId)}"><b>${esc(c?.name || "—")}</b></a>
      <div class="muted">${esc(service(r.serviceId)?.name || "")} · ${esc(doctor(r.doctorId)?.name || "")}</div>
      ${r.careContent ? `<div>${esc(r.careContent)}</div>` : ""}</div><div>${right}</div></div>`;
  };
  return `
  <div class="stats">
    <div class="card stat"><b>${todayList.length}</b><span>Lịch hẹn hôm nay</span></div>
    <div class="card stat"><b>${week.length}</b><span>Lịch hẹn 7 ngày tới</span></div>
    <div class="card stat"><b>${consultToday}</b><span>Lịch tư vấn hôm nay</span></div>
    <div class="card stat"><b>${unconfirmed.length}</b><span>Cần nhắc / xác nhận (2 ngày tới)</span></div>
    <div class="card stat"><b>${recall.length}</b><span>Cần chăm sóc lại</span></div>
    <div class="card stat"><b>${data.customers.length}</b><span>Khách hàng</span></div>
  </div>
  <div class="grid2">
    <div class="card"><h2>Lịch hẹn hôm nay</h2>${todayList.length ? `<div class="list">${todayList.map((r) => item(r, badge(r.status))).join("")}</div>` : `<div class="empty">Hôm nay chưa có lịch hẹn.</div>`}</div>
    <div class="card"><h2>Lịch hẹn tư vấn (7 ngày tới)</h2>${consults.length ? `<div class="list">${consults.map((r) => {
      const c = customer(r.customerId);
      return `<div class="item"><div class="time">${esc(r.consultAt.slice(11, 16))}</div><div style="flex:1"><a href="#" data-cust="${esc(r.customerId)}"><b>${esc(c?.name || "—")}</b></a>
        <div class="muted">${esc(doctor(r.doctorId)?.name || "")}${r.interpreter ? " · Phiên dịch: " + esc(r.interpreter) : ""}</div>${r.consultContent ? `<div>${esc(r.consultContent)}</div>` : ""}</div><div class="muted">${esc(fmtDate(r.consultAt))}</div></div>`;
    }).join("")}</div>` : `<div class="empty">Không có lịch tư vấn sắp tới.</div>`}</div>
    <div class="card"><h2>Cần nhắc / xác nhận lịch</h2>${unconfirmed.length ? `<div class="list">${unconfirmed.sort(byAppt).map((r) => item(r, `<span class="muted">${esc(fmtDate(r.appointmentAt))}</span>`)).join("")}</div>` : `<div class="empty">Không có lịch cần nhắc.</div>`}</div>
    <div class="card"><h2>Khách cần chăm sóc lại (không đến / hủy)</h2>${recall.length ? `<div class="list">${recall.map((r) => item(r, badge(r.status))).join("")}</div>` : `<div class="empty">Không có khách cần chăm sóc lại.</div>`}</div>
  </div>`;
}

/* Bộ lọc dùng chung: mã BN · số điện thoại · khoảng ngày. */
function commonFilters({ dates = true } = {}) {
  const f = filters;
  return `<input type="search" placeholder="Mã BN (VD: BN-02451)" value="${esc(f.bn)}" data-f="bn" aria-label="Lọc theo mã BN" style="max-width:190px">
    <input type="search" inputmode="tel" placeholder="Số điện thoại" value="${esc(f.phone)}" data-f="phone" aria-label="Lọc theo số điện thoại" style="max-width:170px">
    ${dates ? `<label class="dl">Từ ngày <input type="date" value="${esc(f.from)}" data-f="from"></label>
    <label class="dl">Đến ngày <input type="date" value="${esc(f.to)}" data-f="to"></label>` : ""}
    <button class="btn" data-clear-filters>Xóa lọc</button>`;
}
function matchCommon(r, dayList) {
  const f = filters, c = customer(r.customerId);
  if (f.bn.trim() && !r.customerId.toLowerCase().includes(f.bn.trim().toLowerCase())) return false;
  if (digits(f.phone) && !digits(c?.phone).includes(digits(f.phone))) return false;
  if (f.from || f.to) return dayList.some((d) => (!f.from || d >= f.from) && (!f.to || d <= f.to));
  return true;
}
const exportBtn = () => `<button class="btn primary" data-export style="margin-left:auto">Xuất Excel (${shown.ids.length})</button>`;

function appointmentsView() {
  const t = today(), f = filters;
  // Mỗi bản ghi có thể có 2 lịch: lịch hẹn (khám) và lịch hẹn tư vấn; bộ lọc "Loại lịch" chọn lịch nào được tính.
  const days = (r) => [f.apptType !== "consult" && r.appointmentAt, f.apptType !== "visit" && r.consultAt].filter(Boolean).map((s) => s.slice(0, 10));
  const inRange = (ds) => {
    if (f.from || f.to) return true; // đã có khoảng ngày cụ thể → bỏ qua mốc nhanh (matchCommon lo phần này)
    if (f.apptRange === "today") return ds.some((d) => d === t);
    if (f.apptRange === "upcoming") return ds.some((d) => d >= t);
    if (f.apptRange === "week") return ds.some((d) => d >= t && d <= addDays(7));
    if (f.apptRange === "past") return ds.some((d) => d < t);
    return true;
  };
  const list = data.records.filter((r) => {
    const ds = days(r);
    return ds.length && inRange(ds) && matchCommon(r, ds) && (!f.apptDoctor || r.doctorId === f.apptDoctor) && (!f.apptStatus || r.status === f.apptStatus);
  });
  const first = (r) => days(r).sort()[0];
  list.sort((a, b) => first(a).localeCompare(first(b)));
  if (f.apptRange === "past" && !f.from && !f.to) list.reverse();
  shown = { type: "records", ids: list.map((r) => r.id) };
  return `<div class="toolbar">${commonFilters()}</div>
  <div class="toolbar">
    <select data-f="apptType">${options([["all", "Mọi loại lịch"], ["visit", "Lịch hẹn khám"], ["consult", "Lịch hẹn tư vấn"]], f.apptType)}</select>
    <select data-f="apptRange" ${f.from || f.to ? "disabled" : ""}>${options([["upcoming", "Từ hôm nay"], ["today", "Hôm nay"], ["week", "7 ngày tới"], ["past", "Đã qua"], ["all", "Tất cả"]], f.apptRange)}</select>
    <select data-f="apptDoctor">${options(data.doctors.map((d) => [d.id, d.name]), f.apptDoctor, "Tất cả bác sĩ")}</select>
    <select data-f="apptStatus">${options(Object.entries(STATUS).map(([k, v]) => [k, v[0]]), f.apptStatus, "Mọi trạng thái")}</select>
    ${exportBtn()}
  </div>${recordRows(list)}`;
}

function careView() {
  const q = filters.careQ.toLowerCase();
  const list = data.records.filter((r) => {
    const c = customer(r.customerId);
    if (!matchCommon(r, [r.appointmentAt, r.consultAt, r.createdAt].filter(Boolean).map((s) => s.slice(0, 10)))) return false;
    if (!q) return true;
    return [r.customerId, c?.name, c?.phone, r.interpreter, r.careContent, r.consultContent, r.note].some((v) => (v || "").toLowerCase().includes(q));
  }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  shown = { type: "records", ids: list.map((r) => r.id) };
  return `<div class="toolbar">${commonFilters()}</div>
  <div class="toolbar"><input type="search" placeholder="Tìm trong nội dung chăm sóc, tư vấn, ghi chú, phiên dịch…" value="${esc(filters.careQ)}" data-f="careQ" aria-label="Tìm kiếm nội dung" style="max-width:420px">${exportBtn()}</div>${recordRows(list)}`;
}

function customersView() {
  const q = filters.custQ.toLowerCase().replace(/\s/g, "");
  const list = data.customers.filter((c) =>
    (!filters.custStatus || c.status === filters.custStatus) &&
    (!filters.bn.trim() || c.id.toLowerCase().includes(filters.bn.trim().toLowerCase())) &&
    (!digits(filters.phone) || digits(c.phone).includes(digits(filters.phone))) &&
    (!q || (c.name + c.phone + c.id).toLowerCase().replace(/\s/g, "").includes(q)));
  shown = { type: "customers", ids: list.map((c) => c.id) };
  const nextAppt = (id) => data.records.filter((r) => r.customerId === id && r.appointmentAt >= today() && (r.status === "scheduled" || r.status === "confirmed")).sort(byAppt)[0];
  return `<div class="toolbar">${commonFilters({ dates: false })}</div>
  <div class="toolbar">
    <input type="search" placeholder="Tìm theo tên…" value="${esc(filters.custQ)}" data-f="custQ" aria-label="Tìm kiếm">
    <select data-f="custStatus">${options(CUSTOMER_STATUS.map((s) => [s, s]), filters.custStatus, "Mọi trạng thái")}</select>
    ${exportBtn()}
  </div>
  ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Mã BN</th><th>Khách hàng</th><th>Điện thoại</th><th>Bác sĩ phụ trách</th><th>Trạng thái</th><th>Lịch hẹn tiếp theo</th></tr></thead><tbody>
  ${list.map((c) => { const n = nextAppt(c.id); return `<tr class="click" data-cust="${esc(c.id)}">
    <td>${esc(c.id)}</td><td><b>${esc(c.name)}</b><div class="muted">${esc(c.gender)}${c.birthYear ? " · " + c.birthYear : ""}</div></td>
    <td>${esc(c.phone)}</td><td>${esc(doctor(c.doctorId)?.name || "—")}</td><td><span class="badge">${esc(c.status)}</span></td>
    <td>${n ? esc(fmtDT(n.appointmentAt)) : '<span class="muted">—</span>'}</td></tr>`; }).join("")}
  </tbody></table></div>` : `<div class="empty">Không có khách hàng phù hợp.</div>`}`;
}

function syncCard() {
  const s = syncInfo, l = s?.last;
  const when = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const result = !l ? '<span class="muted">Chưa đồng bộ lần nào.</span>'
    : l.ok ? `<span class="badge ok">Thành công</span> ${when(l.at)} — bệnh nhân: +${l.customers.created} mới, ${l.customers.updated} cập nhật${l.customers.conflicts ? `, <b>${l.customers.conflicts} trùng mã (bỏ qua)</b>` : ""} · lịch hẹn: +${l.records.created} mới, ${l.records.updated} cập nhật${l.records.skipped ? `, ${l.records.skipped} bỏ qua` : ""} · bác sĩ ${l.doctors}, dịch vụ ${l.services}`
    : `<span class="badge bad">Lỗi</span> ${when(l.at)} — ${esc(l.error)}`;
  return `<div class="card" style="margin-bottom:16px"><h2>Đồng bộ với website VietXO</h2>
    ${s?.configured
      ? `<p>Nguồn: <b>${esc(s.url)}</b> · chiều <b>website → CSKH</b> (chỉ đọc). Nội dung chăm sóc, tư vấn, phiên dịch, ghi chú của CSKH được giữ nguyên.</p>
         <p>${result}</p><button class="btn primary" id="syncNow">Đồng bộ ngay</button>`
      : `<p class="muted">Chưa cấu hình. Đặt biến môi trường <code>VIETXO_URL</code>, <code>VIETXO_EMAIL</code>, <code>VIETXO_PASSWORD</code> (tài khoản admin/lễ tân của website) rồi khởi động lại server.</p>`}</div>`;
}

function usersView() {
  return syncCard() + `<div class="toolbar"><button class="btn primary" id="newUser">+ Tài khoản</button></div>
  <div class="table-wrap"><table><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Bác sĩ liên kết</th><th>Trạng thái</th><th></th></tr></thead><tbody>
  ${users.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc(ROLE_LABEL[u.role])}</td>
    <td>${esc(doctor(u.doctorId)?.name || "—")}</td><td>${u.active ? '<span class="badge ok">Hoạt động</span>' : '<span class="badge gray">Đã khóa</span>'}</td>
    <td><button class="btn sm" data-edit-user="${u.id}">Sửa</button> ${u.id !== me.id ? `<button class="btn sm danger" data-del-user="${u.id}">Xóa</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div>
  <p class="muted">Quản trị: toàn quyền · Chăm sóc khách hàng: thêm/sửa/xóa khách và lịch chăm sóc · Bác sĩ: xem, thêm và sửa lịch/chăm sóc, không xóa.</p>`;
}

function userForm(u = {}) {
  openModal(`<h2>${u.id ? "Sửa tài khoản" : "Thêm tài khoản"}</h2>
  <form class="form" id="f">
    ${field("Tên đăng nhập *", `<input name="username" required pattern="[a-z0-9._\\-]{3,40}" ${u.id ? "disabled" : ""} value="${esc(u.username)}" autocomplete="off">`)}
    ${field("Họ tên *", `<input name="name" required maxlength="120" value="${esc(u.name)}">`)}
    ${field("Vai trò", `<select name="role">${options(Object.entries(ROLE_LABEL), u.role || "cskh")}</select>`)}
    ${field("Bác sĩ liên kết", `<select name="doctorId">${options(data.doctors.map((d) => [d.id, d.name]), u.doctorId, "—")}</select>`)}
    ${field(u.id ? "Đặt lại mật khẩu (để trống nếu giữ nguyên)" : "Mật khẩu * (tối thiểu 8 ký tự)", `<input name="password" type="password" minlength="8" ${u.id ? "" : "required"} autocomplete="new-password">`)}
    ${u.id ? field("Trạng thái", `<select name="active">${options([["true", "Hoạt động"], ["false", "Khóa"]], String(u.active))}</select>`) : ""}
    <div class="actions" style="grid-column:1/-1"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Lưu</button></div>
  </form>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      if (u.id) { body.active = body.active !== "false"; if (!body.password) delete body.password; }
      await api(u.id ? "PUT" : "POST", u.id ? `/api/users/${u.id}` : "/api/users", body);
      closeModal(); await reload(); toast("Đã lưu tài khoản.");
    } catch (err) { toast(err.message, true); }
  };
}

function passwordForm() {
  openModal(`<h2>Đổi mật khẩu</h2>
  <form class="form" id="f">
    ${field("Mật khẩu hiện tại", `<input name="current" type="password" required autocomplete="current-password">`, true)}
    ${field("Mật khẩu mới (tối thiểu 8 ký tự)", `<input name="next" type="password" minlength="8" required autocomplete="new-password">`, true)}
    <div class="actions" style="grid-column:1/-1"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Đổi mật khẩu</button></div>
  </form>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try { await api("POST", "/api/password", Object.fromEntries(new FormData(e.target))); closeModal(); toast("Đã đổi mật khẩu."); }
    catch (err) { toast(err.message, true); }
  };
}

function render() {
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  $("#title").textContent = TITLES[view][0];
  $("#subtitle").textContent = TITLES[view][1];
  const active = document.activeElement, key = active?.dataset?.f, pos = active?.selectionStart;
  $("#view").innerHTML = { dashboard: dashboardView, appointments: appointmentsView, care: careView, customers: customersView, users: usersView }[view]();
  if (key) { const el = document.querySelector(`[data-f="${key}"]`); if (el) { el.focus(); if (pos != null && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch {} } }
}

/* ---------- Modals ---------- */
function openModal(html, wide) {
  const m = $("#modal"); m.innerHTML = `<div class="dialog${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false;
  m.querySelector("input, select, textarea, button")?.focus();
}
function closeModal() { returnTo = null; $("#modal").hidden = true; $("#modal").innerHTML = ""; }
const field = (label, input, full) => `<div class="field${full ? " full" : ""}"><label>${label}</label>${input}</div>`;

function customerForm(c = {}) {
  openModal(`<h2>${c.id ? "Sửa khách hàng" : "Thêm khách hàng"}</h2>
  <form class="form" id="f">
    ${field("Họ tên *", `<input name="name" required maxlength="120" value="${esc(c.name)}">`)}
    ${field("Số điện thoại *", `<input name="phone" required maxlength="30" inputmode="tel" value="${esc(c.phone)}">`)}
    ${field("Giới tính", `<select name="gender">${options(["Nữ", "Nam", "Khác"].map((s) => [s, s]), c.gender || "Nữ")}</select>`)}
    ${field("Năm sinh", `<input name="birthYear" type="number" min="1900" max="${new Date().getFullYear()}" value="${esc(c.birthYear || "")}">`)}
    ${field("Email", `<input name="email" type="email" value="${esc(c.email)}">`)}
    ${field("Nguồn khách", `<select name="source">${options(data.sources.map((s) => [s, s]), c.source, "—")}</select>`)}
    ${field("Bác sĩ phụ trách", `<select name="doctorId">${options(data.doctors.map((d) => [d.id, d.name + " · " + d.specialty]), c.doctorId, "—")}</select>`)}
    ${field("Trạng thái", `<select name="status">${options(CUSTOMER_STATUS.map((s) => [s, s]), c.status || "Mới")}</select>`)}
    ${field("Địa chỉ", `<input name="address" maxlength="300" value="${esc(c.address)}">`, true)}
    ${field("Ghi chú", `<textarea name="note">${esc(c.note)}</textarea>`, true)}
    <div class="actions full" style="grid-column:1/-1"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Lưu</button></div>
  </form>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const saved = await api(c.id ? "PUT" : "POST", c.id ? `/api/customers/${c.id}` : "/api/customers", body);
      closeModal(); await reload(); toast("Đã lưu khách hàng."); if (!c.id) customerDetail(saved.id);
    } catch (err) { toast(err.message, true); }
  };
}

function recordForm(r = {}, presetCustomer) {
  if (!data.customers.length) return toast("Hãy thêm khách hàng trước.", true);
  const cid = r.customerId || presetCustomer || "";
  openModal(`<h2>${r.id ? "Sửa lịch hẹn / chăm sóc" : "Thêm lịch hẹn / chăm sóc"}</h2>
  <form class="form" id="f">
    ${field("Khách hàng *", `<select name="customerId" required>${options(data.customers.map((c) => [c.id, `${c.name} · ${c.phone}`]), cid, "— Chọn khách hàng —")}</select>`, true)}
    ${field("Lịch hẹn (khám / điều trị)", `<input name="appointmentAt" type="datetime-local" value="${esc(r.appointmentAt)}">`)}
    ${field("Lịch hẹn tư vấn", `<input name="consultAt" type="datetime-local" value="${esc(r.consultAt)}">`)}
    ${field("Trạng thái lịch hẹn", `<select name="status">${options(Object.entries(STATUS).map(([k, v]) => [k, v[0]]), r.status || "scheduled")}</select>`)}
    ${field("Bác sĩ", `<select name="doctorId">${options(data.doctors.map((d) => [d.id, d.name]), r.doctorId || customer(cid)?.doctorId, "—")}</select>`)}
    ${field("Dịch vụ", `<select name="serviceId">${options(data.services.map((s) => [s.id, s.name]), r.serviceId, "—")}</select>`)}
    ${field("Phiên dịch viên", `<input name="interpreter" maxlength="120" list="interpreters" placeholder="Chọn hoặc nhập tên (nếu cần phiên dịch)" value="${esc(r.interpreter)}"><datalist id="interpreters">${[...new Set(data.records.map((x) => x.interpreter).filter(Boolean))].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`, true)}
    ${field("Nội dung chăm sóc", `<textarea name="careContent" placeholder="VD: Gọi nhắc lịch, hỏi thăm sau điều trị…">${esc(r.careContent)}</textarea>`, true)}
    ${field("Nội dung tư vấn", `<textarea name="consultContent" placeholder="VD: Tư vấn phương án, chi phí, thời gian điều trị…">${esc(r.consultContent)}</textarea>`, true)}
    ${field("Ghi chú", `<textarea name="note">${esc(r.note)}</textarea>`, true)}
    <div class="actions" style="grid-column:1/-1"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Lưu</button></div>
  </form>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const back = returnTo; returnTo = null;
      await api(r.id ? "PUT" : "POST", r.id ? `/api/records/${r.id}` : "/api/records", body);
      closeModal(); await reload(); toast("Đã lưu.");
      if (back) customerDetail(back);
    } catch (err) { toast(err.message, true); }
  };
}

function customerDetail(id) {
  const c = customer(id); if (!c) return;
  const recs = data.records.filter((r) => r.customerId === id).sort((a, b) => (b.appointmentAt || b.createdAt).localeCompare(a.appointmentAt || a.createdAt));
  openModal(`<h2>${esc(c.name)} <span class="badge">${esc(c.status)}</span></h2>
  <div class="profile">
    <div><small>Mã BN</small>${esc(c.id)}</div><div><small>Điện thoại</small>${esc(c.phone)}</div>
    <div><small>Giới tính / Năm sinh</small>${esc(c.gender)}${c.birthYear ? " · " + c.birthYear : ""}</div>
    <div><small>Bác sĩ phụ trách</small>${esc(doctor(c.doctorId)?.name || "—")}</div>
    <div><small>Nguồn</small>${esc(c.source || "—")}</div>
    ${c.email ? `<div><small>Email</small>${esc(c.email)}</div>` : ""}${c.address ? `<div><small>Địa chỉ</small>${esc(c.address)}</div>` : ""}
  </div>
  ${c.note ? `<p><b>Ghi chú:</b> ${esc(c.note)}</p>` : ""}
  <div class="toolbar"><button class="btn primary" data-new-rec="${esc(id)}">+ Lịch hẹn / chăm sóc</button>${canEdit() ? `<button class="btn" data-edit-cust="${esc(id)}">Sửa hồ sơ</button><button class="btn danger" data-del-cust="${esc(id)}">Xóa khách hàng</button>` : ""}<button class="btn" data-close style="margin-left:auto">Đóng</button></div>
  <h3>Lịch sử chăm sóc (${recs.length})</h3>
  <div class="timeline">${recs.length ? recs.map((r) => `<div class="tl"><div class="tl-head"><b>${esc(fmtDT(r.appointmentAt))}</b>${badge(r.status)}
    <span class="muted">${esc(doctor(r.doctorId)?.name || "")}${service(r.serviceId) ? " · " + esc(service(r.serviceId).name) : ""}</span>${r.interpreter ? `<span class="badge gray">Phiên dịch: ${esc(r.interpreter)}</span>` : ""}
    <span style="margin-left:auto"><button class="btn sm" data-edit-rec="${r.id}">Sửa</button> ${canEdit() ? `<button class="btn sm danger" data-del-rec="${r.id}">Xóa</button>` : ""}</span></div>
    <dl>${r.consultAt ? `<div><dt>Lịch hẹn tư vấn</dt><dd>${esc(fmtDT(r.consultAt))}</dd></div>` : ""}<div><dt>Nội dung chăm sóc</dt><dd>${nl(r.careContent)}</dd></div><div><dt>Nội dung tư vấn</dt><dd>${nl(r.consultContent)}</dd></div><div><dt>Ghi chú</dt><dd>${nl(r.note)}</dd></div></dl></div>`).join("") : `<div class="empty">Chưa có lịch sử chăm sóc.</div>`}</div>`, true);
}

/* ---------- Events ---------- */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("button, a, tr[data-cust]"); if (!t) { if (e.target === $("#modal")) closeModal(); return; }
  const d = t.dataset;
  if (d.view) { view = d.view; $("#side").classList.remove("open"); render(); }
  else if (d.export !== undefined) exportXlsx();
  else if (d.clearFilters !== undefined) { Object.assign(filters, { bn: "", phone: "", from: "", to: "" }); render(); }
  else if (t.id === "syncNow") {
    t.disabled = true; t.textContent = "Đang đồng bộ…";
    try { const r = await api("POST", "/api/sync"); await reload(); toast(`Đồng bộ xong: +${r.customers.created} bệnh nhân, +${r.records.created} lịch hẹn.`); }
    catch (err) { await reload().catch(() => {}); toast(err.message, true); }
  }
  else if (d.close !== undefined) closeModal();
  else if (d.cust) { e.preventDefault(); customerDetail(d.cust); }
  else if (d.editUser) userForm(users.find((u) => u.id === d.editUser));
  else if (d.delUser && confirm("Xóa tài khoản này?")) {
    try { await api("DELETE", `/api/users/${d.delUser}`); await reload(); toast("Đã xóa tài khoản."); } catch (err) { toast(err.message, true); }
  }
  else if (t.id === "newUser") userForm();
  else if (d.editCust) customerForm(customer(d.editCust));
  else if (d.newRec) { returnTo = d.newRec; recordForm({}, d.newRec); }
  else if (d.editRec) { returnTo = $("#modal").hidden ? null : data.records.find((r) => r.id === d.editRec)?.customerId; recordForm(data.records.find((r) => r.id === d.editRec)); }
  else if (d.delRec && confirm("Xóa bản ghi chăm sóc này?")) {
    const cid = data.records.find((r) => r.id === d.delRec)?.customerId, detail = !$("#modal").hidden;
    await api("DELETE", `/api/records/${d.delRec}`); await reload(); toast("Đã xóa.");
    if (detail && cid) customerDetail(cid);
  } else if (d.delCust && confirm("Xóa khách hàng và toàn bộ lịch sử chăm sóc? Không thể hoàn tác.")) {
    await api("DELETE", `/api/customers/${d.delCust}`); closeModal(); await reload(); toast("Đã xóa khách hàng.");
  }
});
document.addEventListener("input", (e) => { const k = e.target.dataset?.f; if (k && e.target.tagName === "INPUT") { filters[k] = e.target.value; render(); } });
document.addEventListener("change", (e) => { const k = e.target.dataset?.f; if (k && e.target.tagName === "SELECT") { filters[k] = e.target.value; render(); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
$("#newCustomer").onclick = () => customerForm();
$("#newRecord").onclick = () => recordForm();
$("#menuBtn").onclick = () => $("#side").classList.toggle("open");

fetch("/api/demo").then((r) => r.json()).then((j) => { $("#demoHint").hidden = !j.demo; }).catch(() => {});
document.addEventListener("click", (e) => {
  const u = e.target.dataset?.demo; if (!u) return;
  $("#lu").value = u; $("#lp").value = "demo1234"; $("#loginForm").requestSubmit();
});
$("#pwBtn").onclick = passwordForm;
$("#logoutBtn").onclick = async () => { try { await api("POST", "/api/logout"); } catch {} me = null; $("#me").hidden = true; showLogin(); };
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    me = await api("POST", "/api/login", Object.fromEntries(new FormData(e.target)));
    applyRole(); view = "dashboard"; await reload();
  } catch (err) { $("#loginErr").textContent = err.message; }
};
boot();
