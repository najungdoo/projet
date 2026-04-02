const STORAGE_KEY_STUDENTS = "qr_attendance_students_v1";
const STORAGE_KEY_ATTENDANCE = "qr_attendance_records_v1";

const studentInput = document.getElementById("studentInput");
const studentTableWrap = document.getElementById("studentTableWrap");
const attendanceTableWrap = document.getElementById("attendanceTableWrap");
const attendanceSummary = document.getElementById("attendanceSummary");
const scanStatus = document.getElementById("scanStatus");

const generateBtn = document.getElementById("generateBtn");
const clearStudentsBtn = document.getElementById("clearStudentsBtn");
const startScanBtn = document.getElementById("startScanBtn");
const stopScanBtn = document.getElementById("stopScanBtn");
const resetTodayBtn = document.getElementById("resetTodayBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");

let students = loadStudents();
let attendance = loadAttendance();
let html5QrCode = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadStudents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_STUDENTS) || "[]");
  } catch {
    return [];
  }
}

function saveStudents() {
  localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(students));
}

function loadAttendance() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_ATTENDANCE) || "{}");
  } catch {
    return {};
  }
}

function saveAttendance() {
  localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(attendance));
}

function parseStudentsFromInput(raw) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const [idRaw, nameRaw] = line.includes(",") ? line.split(",") : ["", line];
      const id = idRaw.trim() || `${new Date().getFullYear()}${String(idx + 1).padStart(3, "0")}`;
      const name = (nameRaw || "").trim();
      return { id, name };
    })
    .filter((s) => s.name);
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function qrPayload(student) {
  return JSON.stringify({ studentId: student.id, name: student.name });
}

async function renderStudentsTable() {
  if (!students.length) {
    studentTableWrap.innerHTML = "<p>등록된 학생이 없습니다.</p>";
    return;
  }

  const rows = students
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.id)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td><div id="qr-${escapeHtml(s.id)}" class="qr-box"></div></td>
      </tr>
    `
    )
    .join("");

  studentTableWrap.innerHTML = `
    <table>
      <thead><tr><th>학번</th><th>이름</th><th>QR</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  for (const s of students) {
    const target = document.getElementById(`qr-${CSS.escape(s.id)}`);
    if (target) {
      target.innerHTML = "";
      const canvas = document.createElement("canvas");
      target.appendChild(canvas);
      await QRCode.toCanvas(canvas, qrPayload(s), {
        width: 84,
        margin: 1,
      });
    }
  }
}

function markAttendance(studentId) {
  const date = todayKey();
  attendance[date] ||= {};
  if (!attendance[date][studentId]) {
    attendance[date][studentId] = new Date().toISOString();
    saveAttendance();
  }
}

function renderAttendanceTable() {
  if (!students.length) {
    attendanceSummary.textContent = "학생 등록 후 출결을 확인할 수 있습니다.";
    attendanceTableWrap.innerHTML = "";
    return;
  }

  const date = todayKey();
  const records = attendance[date] || {};
  const presentCount = students.filter((s) => records[s.id]).length;

  attendanceSummary.textContent = `${date} 출석 ${presentCount}명 / 총 ${students.length}명`;

  const rows = students
    .map((s) => {
      const checkedAt = records[s.id];
      const status = checkedAt
        ? `<span class="badge present">출석</span>`
        : `<span class="badge absent">미출석</span>`;

      return `
      <tr>
        <td>${escapeHtml(s.id)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${status}</td>
        <td>${checkedAt ? new Date(checkedAt).toLocaleTimeString("ko-KR") : "-"}</td>
      </tr>
    `;
    })
    .join("");

  attendanceTableWrap.innerHTML = `
    <table>
      <thead><tr><th>학번</th><th>이름</th><th>상태</th><th>체크 시간</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function notify(msg, isError = false) {
  scanStatus.textContent = msg;
  scanStatus.style.background = isError ? "#fde9ec" : "#eef3ff";
  scanStatus.style.color = isError ? "#7d1625" : "#24345f";
}

async function startScanner() {
  if (!students.length) {
    notify("먼저 학생 QR을 생성하세요.", true);
    return;
  }

  if (!window.Html5Qrcode) {
    notify("스캐너 라이브러리를 불러오지 못했습니다.", true);
    return;
  }

  html5QrCode = new Html5Qrcode("reader");
  startScanBtn.disabled = true;
  stopScanBtn.disabled = false;

  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 240 },
      (decodedText) => {
        try {
          const data = JSON.parse(decodedText);
          const found = students.find((s) => s.id === data.studentId);
          if (!found) {
            notify("등록되지 않은 QR입니다.", true);
            return;
          }
          const already = attendance[todayKey()]?.[found.id];
          markAttendance(found.id);
          renderAttendanceTable();
          notify(
            already
              ? `${found.name} 학생은 이미 출석 처리되었습니다.`
              : `${found.name} 학생 출석 완료!`
          );
        } catch {
          notify("유효한 학생 QR 형식이 아닙니다.", true);
        }
      }
    );
    notify("스캐너 실행 중... 학생 QR을 비춰주세요.");
  } catch (error) {
    notify(`스캐너 시작 실패: ${error?.message || "알 수 없는 오류"}`, true);
    startScanBtn.disabled = false;
    stopScanBtn.disabled = true;
  }
}

async function stopScanner() {
  if (!html5QrCode) return;

  try {
    await html5QrCode.stop();
    await html5QrCode.clear();
    notify("스캐너가 중지되었습니다.");
  } catch {
    notify("스캐너 중지 중 오류가 발생했습니다.", true);
  } finally {
    html5QrCode = null;
    startScanBtn.disabled = false;
    stopScanBtn.disabled = true;
  }
}

function downloadTodayCsv() {
  const date = todayKey();
  const records = attendance[date] || {};
  const lines = ["date,student_id,name,status,checked_at"];

  for (const s of students) {
    const checkedAt = records[s.id] || "";
    const status = checkedAt ? "present" : "absent";
    lines.push(`${date},${s.id},${s.name},${status},${checkedAt}`);
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

generateBtn.addEventListener("click", async () => {
  const parsed = parseStudentsFromInput(studentInput.value);
  if (!parsed.length) {
    alert("학생 정보를 1명 이상 입력해주세요.");
    return;
  }

  const unique = new Map();
  parsed.forEach((s) => unique.set(s.id, s));
  students = [...unique.values()];
  saveStudents();
  await renderStudentsTable();
  renderAttendanceTable();
  notify("학생 QR코드를 생성했습니다.");
});

clearStudentsBtn.addEventListener("click", () => {
  if (!confirm("학생 목록을 모두 삭제할까요?")) return;
  students = [];
  saveStudents();
  renderStudentsTable();
  renderAttendanceTable();
  notify("학생 목록이 초기화되었습니다.");
});

startScanBtn.addEventListener("click", startScanner);
stopScanBtn.addEventListener("click", stopScanner);

downloadCsvBtn.addEventListener("click", downloadTodayCsv);

resetTodayBtn.addEventListener("click", () => {
  if (!confirm("오늘 출결 데이터를 초기화할까요?")) return;
  attendance[todayKey()] = {};
  saveAttendance();
  renderAttendanceTable();
  notify("오늘 출결이 초기화되었습니다.");
});

window.addEventListener("beforeunload", stopScanner);

renderStudentsTable();
renderAttendanceTable();
