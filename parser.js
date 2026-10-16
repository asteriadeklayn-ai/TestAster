// Word (.docx) va Excel (.xlsx) fayllaridan test savollarini o'qish.
// Har bir savolda variantlar ro'yxatidagi BIRINCHI variant to'g'ri javob hisoblanadi
// (Excel'da 6-ustunda "A/B/C/D" yoki 1-4 berilsa, o'sha to'g'ri javob bo'ladi).
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');

const OPTS = 4;

function parseWordText(raw) {
  const lines = raw.split(/\r?\n/).map((s) => s.trim());
  const blocks = [];
  let cur = [];
  for (const l of lines) {
    if (/^\+{3,}$/.test(l)) { blocks.push(cur); cur = []; } else cur.push(l);
  }
  blocks.push(cur);

  const questions = [];
  const warnings = [];
  blocks.forEach((block, bi) => {
    let items = [];
    for (const l of block) {
      if (!l || /^={3,}$/.test(l)) continue;
      // "3 ta========" ko'rinishi: oxiridagi ==== belgisi shunchaki ajratgich
      const trail = /\s*={3,}\s*$/.test(l);
      const t = l.replace(/\s*={3,}\s*$/, '').trim();
      if (t) items.push({ t, trail });
    }
    if (!items.length) return;
    // Bitta variant ikki qatorga bo'lib yozilgan bo'lsa (kichik harf bilan davom etsa), birlashtiramiz
    if (items.length === OPTS + 2) {
      for (let i = 2; i < items.length; i++) {
        if (items[i - 1].trail && /^\p{Ll}/u.test(items[i].t)) {
          items.splice(i - 1, 2, { t: items[i - 1].t + ' ' + items[i].t, trail: items[i].trail });
          break;
        }
      }
    }
    if (items.length !== OPTS + 1) {
      warnings.push(`${bi + 1}-blok o'tkazib yuborildi (savol + ${OPTS} variant kerak, topildi: ${items.length}): "${items[0].t.slice(0, 70)}"`);
      return;
    }
    questions.push({ text: items[0].t, options: items.slice(1).map((x) => x.t) });
  });
  return { questions, warnings };
}

async function parseDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return parseWordText(value);
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
  }
  return String(v);
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const questions = [];
  const warnings = [];
  wb.eachSheet((ws) => {
    ws.eachRow((row, rn) => {
      let cells = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value).trim());
      cells = cells.filter((x) => x !== '');
      if (!cells.length) return;
      if (/^(№|#|t\/r|savol|question)/i.test(cells[0]) && cells.length <= 7 && rn === 1) return; // sarlavha
      if (/^\d+$/.test(cells[0]) && cells.length >= OPTS + 2) cells = cells.slice(1); // tartib raqami ustuni
      if (cells.length < OPTS + 1) {
        warnings.push(`"${ws.name}" varag'i, ${rn}-qator o'tkazib yuborildi (savol + ${OPTS} variant kerak)`);
        return;
      }
      const text = cells[0];
      let options = cells.slice(1, 1 + OPTS);
      const extra = cells[1 + OPTS];
      if (extra) {
        const m = String(extra).trim().toUpperCase();
        let idx = 'ABCD'.indexOf(m);
        if (idx < 0 && /^[1-4]$/.test(m)) idx = Number(m) - 1;
        if (idx > 0) { const [c] = options.splice(idx, 1); options.unshift(c); }
      }
      questions.push({ text, options });
    });
  });
  return { questions, warnings };
}

async function parseUpload(filename, buffer) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'docx') return parseDocx(buffer);
  if (ext === 'xlsx') return parseXlsx(buffer);
  throw new Error("Faqat .docx (Word) va .xlsx (Excel) fayllari qabul qilinadi");
}

async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Savollar');
  ws.addRow(['Savol', "To'g'ri javob (A)", 'B variant', 'C variant', 'D variant', "To'g'ri javob harfi (ixtiyoriy)"]);
  ws.addRow(['Misol: Globallashuv nima?', 'Jahon iqtisodiyotining yaxlitlashuvi', 'Faqat siyosiy jarayon', 'Mahalliy bozor', "Madaniy an'ana"]);
  ws.columns = [{ width: 60 }, { width: 38 }, { width: 28 }, { width: 28 }, { width: 28 }, { width: 22 }];
  ws.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}

module.exports = { parseUpload, parseWordText, buildTemplate };
