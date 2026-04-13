/// <reference types="chrome" />
import { useEffect, useMemo, useState } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { yaml } from "@codemirror/lang-yaml"

import "./template-editor.css"
import { t } from "../lib/i18n"
import { defaultPromptTemplateState, loadPromptTemplateState, savePromptTemplateState } from "../lib/settings"
import { useAppSettings } from "../lib/use-app-settings"
import type { PromptTemplate } from "../types/settings"

function TemplateEditorPage() {
  const settings = useAppSettings()
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [templateId, setTemplateId] = useState<string>("")
  const [name, setName] = useState("")
  const [content, setContent] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(true)

  const activeTemplate = useMemo(
    () => templates.find((item) => item.id === templateId) ?? null,
    [templateId, templates]
  )

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("templateId") ?? ""
    setTemplateId(id)

    void (async () => {
      const state = await loadPromptTemplateState()
      const target = state.templates.find((item) => item.id === id) ?? state.templates[0] ?? defaultPromptTemplateState.templates[0]
      setTemplates(state.templates)
      setTemplateId(target.id)
      setName(target.name)
      setContent(target.content)
      setLoading(false)
    })()
  }, [])

  const save = async (): Promise<void> => {
    if (!activeTemplate) {
      setStatus(t(settings.language, "statusNoEditableTemplate"))
      return
    }

    if (!name.trim() || !content.trim()) {
      setStatus(t(settings.language, "statusTemplateEmpty"))
      return
    }

    const latest = await loadPromptTemplateState()
    const next = {
      ...latest,
      templates: latest.templates.map((item) =>
        item.id === activeTemplate.id
          ? {
              ...item,
              name: name.trim(),
              content,
              updatedAt: Date.now()
            }
          : item
      )
    }

    await savePromptTemplateState(next)
    setStatus(t(settings.language, "statusTemplateSaved"))
  }

  if (loading) {
    return <main className="template-editor-page"><p>{t(settings.language, "statusImporting")}</p></main>
  }

  return (
    <main className="template-editor-page">
      <header className="template-editor-header">
        <h1>{t(settings.language, "templateEditorTitle")}</h1>
        <p>{t(settings.language, "templateEditorHint")}</p>
      </header>

      <section className="template-editor-panel">
        <label className="template-editor-label">{t(settings.language, "templateName")}</label>
        <input
          className="template-editor-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(settings.language, "templateName")}
        />

        <label className="template-editor-label">YAML</label>
        <div className="template-editor-cm">
          <CodeMirror
            value={content}
            height="460px"
            extensions={[yaml()]}
            onChange={(value) => setContent(value)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              autocompletion: true
            }}
          />
        </div>

        <div className="template-editor-actions">
          <button className="btn ok" onClick={() => void save()}>{t(settings.language, "saveTemplate")}</button>
          <button className="btn primary" onClick={() => window.close()}>{t(settings.language, "editorCancel")}</button>
        </div>

        {status ? <pre className="template-editor-status">{status}</pre> : null}
      </section>
    </main>
  )
}

export default TemplateEditorPage
