/**
 * Minimal RFC-4180-ish CSV codec for the curated dataset: header row, quoted fields with
 * doubled-quote escapes, commas inside quotes. Newlines inside fields are not supported —
 * curated notes must stay single-line (the validator enforces parseability).
 */

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return []
  const header = splitCsvLine(lines[0] as string)
  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line)
    if (cells.length !== header.length) {
      throw new Error(`row ${i + 2}: expected ${header.length} cells, got ${cells.length}`)
    }
    const row: Record<string, string> = {}
    header.forEach((h, c) => {
      row[h] = cells[c] as string
    })
    return row
  })
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined): string => {
    if (v == null) return ''
    const s = String(v)
    return /[",]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  return [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
}
