import { useEffect, useRef, useState } from 'react'
import { ICD10_CODES, ICD10_MAP } from '../data/icd10'

interface Props {
  value: string
  onChange: (code: string) => void
  error?: string | null
  testId?: string
}

export default function ICD10Input({ value, onChange, error, testId }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setQuery(value)
  }, [value])

  const q = query.trim()
  const matches =
    q.length >= 1
      ? ICD10_CODES.filter(
          (c) =>
            c.code.startsWith(q.toUpperCase()) ||
            c.description.toLowerCase().includes(q.toLowerCase()),
        ).slice(0, 8)
      : []

  const description = ICD10_MAP.get(value.toUpperCase())

  const select = (code: string) => {
    onChange(code)
    setQuery(code)
    setOpen(false)
    setCursor(-1)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase()
    setQuery(val)
    onChange(val)
    setOpen(true)
    setCursor(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && cursor >= 0) {
      e.preventDefault()
      select(matches[cursor].code)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative flex-1">
      <input
        type="text"
        className={`form-input w-full font-mono ${error ? 'border-red-500' : ''}`}
        placeholder="Code or diagnosis (e.g. R07.9 or chest pain)"
        value={query}
        onChange={handleChange}
        onFocus={() => {
          clearTimeout(blurTimer.current)
          setOpen(true)
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
        data-testid={testId}
        autoComplete="off"
        spellCheck={false}
      />
      {description && !error && (
        <p className="text-xs text-green-700 mt-0.5 pl-1">{description}</p>
      )}
      {error && <p className="text-xs text-red-500 mt-0.5 pl-1">{error}</p>}
      {open && matches.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
          {matches.map((m, i) => (
            <li
              key={m.code}
              className={`px-3 py-2 cursor-pointer flex gap-3 text-sm ${
                i === cursor ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
              onMouseDown={() => select(m.code)}
            >
              <span className="font-mono text-blue-700 shrink-0 w-24">{m.code}</span>
              <span className="text-gray-600 truncate">{m.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
