import { t } from "../lib/i18n"
import type { AppLanguage } from "../types/settings"

type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  language: AppLanguage
}

export function SearchInput({ value, onChange, placeholder, language }: SearchInputProps): JSX.Element {
  return (
    <div className="compare-viewer-search-wrap">
      <input
        className="compare-viewer-search-input with-clear"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button
          className="search-clear-btn"
          onClick={() => onChange("")}
          aria-label={t(language, "clearSearch")}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
