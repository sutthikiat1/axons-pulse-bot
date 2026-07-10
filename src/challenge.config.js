// AXONS Pulse Bot — challenge (button disguise) configuration
// ─────────────────────────────────────────────────────────────
// Challenge mode = สลับ "ไอคอน + สี" ของปุ่ม Done / Skip / Wait
// ให้ไม่ตรงกับฟังก์ชันจริง เพื่อเพิ่มความยาก/สนุก เป็นกิมมิค
// (กันการกดตามความเคยชิน เช่น เห็นเขียว/ติ๊กถูก = กดเลย)
//
//   enabled: false → ปุ่มปกติ ไอคอน/สี ตรงตามฟังก์ชัน (default)
//   enabled: true  → สลับ ไอคอน+สี แบบสุ่มทุก broadcast
//
// สำคัญ: "คำ" บนปุ่ม (Done / Skip / Wait) ยังบอกฟังก์ชันจริงเสมอ —
// สลับแค่ ไอคอน+สี เท่านั้น เพื่อให้ยังกดถูกได้ถ้าอ่านดีๆ
// (กัน check-in ผิดโดยไม่ตั้งใจ เพราะเป็นข้อมูลจริง)
// ─────────────────────────────────────────────────────────────

const config = {
  enabled: false,
};

function isChallengeEnabled() {
  return config.enabled === true;
}

module.exports = { isChallengeEnabled };
