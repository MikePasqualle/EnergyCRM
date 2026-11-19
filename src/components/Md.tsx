import Link from 'next/link'
import type { ReactNode } from 'react'

/** Безпечний міні-markdown для відповідей агента: абзаци, списки, таблиці, **жирний**, `код`, внутрішні посилання. Без innerHTML. */
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(\/[^)\s]*\))/g
  let last = 0, i = 0
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push(s.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<b key={`${key}${i++}`}>{t.slice(2, -2)}</b>)
    else if (t.startsWith('`')) out.push(<code key={`${key}${i++}`}>{t.slice(1, -1)}</code>)
    else { const mm = /^\[([^\]]+)\]\((\/[^)\s]*)\)$/.exec(t)!; out.push(<Link key={`${key}${i++}`} href={mm[2]} style={{ color: '#1a479a', fontWeight: 600 }}>{mm[1]}</Link>) }
    last = m.index! + t.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function Md({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let k = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) continue
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { if (!/^\s*\|[\s:|-]+\|?\s*$/.test(lines[i])) rows.push(cells(lines[i])); i++ }
      i--
      const [head, ...body] = rows
      blocks.push(
        <div key={k++} style={{ overflowX: 'auto' }}><table className="ag-tbl"><thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `h${j}`)}</th>)}</tr></thead>
          <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `c${ri}${j}`)}</td>)}</tr>)}</tbody></table></div>,
      )
      continue
    }
    const h = /^#{1,6}\s+(.*)$/.exec(l)
    if (h) { blocks.push(<h4 key={k++}>{inline(h[1], `t${k}`)}</h4>); continue }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d/.test(l)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')); i++ }
      i--
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(<Tag key={k++}>{items.map((it, j) => <li key={j}>{inline(it, `l${j}`)}</li>)}</Tag>)
      continue
    }
    const para: string[] = [l]
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*(\||#|[-*•]\s|\d+[.)]\s)/.test(lines[i + 1])) para.push(lines[++i])
    blocks.push(<p key={k++}>{para.flatMap((p, j) => [...inline(p, `p${k}${j}`), j < para.length - 1 ? <br key={`b${j}`} /> : null])}</p>)
  }
  return <>{blocks}</>
}
