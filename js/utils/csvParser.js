/**
 * Runner Pulse Analytics - Robust RFC-4180 CSV Parser
 * 專為 Google Sheets CSV Export 設計，完整支援包含逗號、換行與雙引號的欄位
 */

/**
 * 將 CSV 文字字串解析為二維陣列 (string[][])
 * @param {string} csvText 
 * @returns {string[][]}
 */
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];

  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  let i = 0;
  const len = csvText.length;

  while (i < len) {
    const char = csvText[i];
    const nextChar = i + 1 < len ? csvText[i + 1] : '';

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // 雙引號轉義 ("") -> 視為單引號字元
        currentVal += '"';
        i += 2;
        continue;
      } else {
        // 切換引號狀態
        inQuotes = !inQuotes;
        i++;
        continue;
      }
    }

    if (char === ',' && !inQuotes) {
      // 欄位分隔
      currentRow.push(currentVal.trim());
      currentVal = '';
      i++;
      continue;
    }

    if ((char === '\r' || char === '\n') && !inQuotes) {
      // 列分隔
      currentRow.push(currentVal.trim());
      // 避免加入純空列
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';

      if (char === '\r' && nextChar === '\n') {
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    currentVal += char;
    i++;
  }

  // 處理最後一個欄位與列
  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}
