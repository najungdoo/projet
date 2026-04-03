/**
 * Created by najd on 2026.
 * Copyright (C) 2026 najd. All rights reserved.
 */
const STORAGE_KEY_STUDENTS = "qr_attendance_students_v1";
const STORAGE_KEY_ATTENDANCE = "qr_attendance_records_v1";

const studentInput = document.getElementById("studentInput");
const studentTableWrap = document.getElementById("studentTableWrap");
const attendanceTableWrap = document.getElementById("attendanceTableWrap");
const attendanceSummary = document.getElementById("attendanceSummary");
const scanStatus = document.getElementById("scanStatus");

const generateBtn = document.getElementById("generateBtn");
const clearStudentsBtn = document.getElementById("clearStudentsBtn");
const printQrBtn = document.getElementById("printQrBtn");
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
        <td><button class="ghost" onclick="downloadQr('${escapeHtml(s.id)}', '${escapeHtml(s.name).replace(/'/g, "\\'")}')">다운로드</button></td>
      </tr>
    `
    )
    .join("");

  studentTableWrap.innerHTML = `
    <table>
      <thead><tr><th>학번</th><th>이름</th><th>QR</th><th>액션</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  for (const s of students) {
    const target = document.getElementById(`qr-${s.id}`);
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
  if (!confirm("학생 목록을 모두 삭제할까요? 출결 데이터도 함께 초기화됩니다.")) return;
  students = [];
  attendance = {};
  saveStudents();
  saveAttendance();
  renderStudentsTable();
  renderAttendanceTable();
  notify("학생 목록 및 출결 현황이 초기화되었습니다.");
});

if (printQrBtn) {
  printQrBtn.addEventListener("click", () => {
    if (!students.length) {
      alert("인쇄할 학생 정보가 없습니다.");
      return;
    }
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("팝업 차단을 해제해주세요.");
      return;
    }

    let html = `<!DOCTYPE html>
<html>
<head>
  <title>QR코드 인쇄</title>
  <style>
    body { font-family: "Pretendard", "Noto Sans KR", sans-serif; text-align: center; margin: 20px; }
    .qr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px; }
    .qr-container { border: 1px dashed #ccc; padding: 15px; border-radius: 8px; }
    .qr-container img { width: 120px; height: 120px; }
    .name { font-weight: bold; margin-top: 8px; font-size: 16px; color: #333; }
    .id { color: #666; font-size: 14px; margin-top: 4px; }
    .print-btn { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #2351ff; color: #fff; border: none; border-radius: 8px; margin-bottom: 20px; font-weight: bold; }
    @media print {
      .no-print { display: none; }
      .qr-container { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="print-btn" onclick="window.print()">🖨️ 인쇄하기</button>
  </div>
  <div class="qr-grid">`;

    for (const s of students) {
      const canvas = document.querySelector("#qr-" + s.id + " canvas");
      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");
        html += `
        <div class="qr-container">
          <img src="${dataUrl}" />
          <div class="name">${escapeHtml(s.name)}</div>
          <div class="id">${escapeHtml(s.id)}</div>
        </div>`;
      }
    }

    html += `  </div>
</body>
</html>`;
    
    printWindow.document.write(html);
    printWindow.document.close();
  });
}

window.downloadQr = function(id, name) {
  const canvas = document.querySelector("#qr-" + id + " canvas");
  if (!canvas) {
    alert("QR 코드가 아직 생성되지 않았습니다.");
    return;
  }
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `QR_${name}_${id}.png`;
  a.click();
};

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

// 탭 전환 로직
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    // 모든 탭과 콘텐츠를 비활성화
    tabBtns.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    
    // 클릭된 탭 활성화
    btn.classList.add("active");
    const targetId = btn.getAttribute("data-target");
    document.getElementById(targetId).classList.add("active");

    // 다른 탭으로 이동할 때 켜져 있는 스캐너 중지
    if (targetId !== 'view-scan' && html5QrCode) {
      stopScanner();
    }
  });
});

