"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  Loader2, Database, ChevronDown, ChevronRight, RefreshCw,
  CheckCircle2, AlertCircle, Clock, XCircle, MinusCircle,
  Target, Users, HelpCircle, Building2, ScrollText, FileText
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemorySection {
  phase: string
  intent: string | null
  sectionStatus: Record<string, string>
  blockages: Array<{ section: string; reason: string }> | null
}

interface MemoryData {
  project: Record<string, unknown> | null
  actors: Array<Record<string, unknown>> | null
  clarifications: Array<Record<string, unknown>> | null
  entities: Array<Record<string, unknown>> | null
  businessRules: Array<Record<string, unknown>> | null
  requirements: Array<Record<string, unknown>> | null
  userStories: Array<Record<string, unknown>> | null
  runState: MemorySection
}

type SectionKey = keyof Omit<MemoryData, "runState">

interface SectionMeta {
  key: SectionKey
  label: string
  icon: React.ReactNode
}

const SECTIONS: SectionMeta[] = [
  { key: "project", label: "Project Brief", icon: <Target className="h-3.5 w-3.5" /> },
  { key: "actors", label: "Actors", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "clarifications", label: "Clarifications", icon: <HelpCircle className="h-3.5 w-3.5" /> },
  { key: "entities", label: "Entities", icon: <Building2 className="h-3.5 w-3.5" /> },
  { key: "businessRules", label: "Business Rules", icon: <ScrollText className="h-3.5 w-3.5" /> },
  { key: "requirements", label: "Requirements", icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "userStories", label: "User Stories", icon: <FileText className="h-3.5 w-3.5" /> },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string | undefined): { label: string; color: string; icon: React.ReactNode } {
  switch (status) {
    case "valid":
      return { label: "Valid", color: "text-emerald-400 bg-emerald-500/10", icon: <CheckCircle2 className="h-3 w-3" /> }
    case "draft":
      return { label: "Draft", color: "text-blue-400 bg-blue-500/10", icon: <Clock className="h-3 w-3" /> }
    case "stale":
      return { label: "Stale", color: "text-amber-400 bg-amber-500/10", icon: <AlertCircle className="h-3 w-3" /> }
    case "blocked":
      return { label: "Blocked", color: "text-red-400 bg-red-500/10", icon: <XCircle className="h-3 w-3" /> }
    default:
      return { label: "Missing", color: "text-text-faint bg-bg-subtle", icon: <MinusCircle className="h-3 w-3" /> }
  }
}

function formatCount(items: unknown): number {
  return Array.isArray(items) ? items.length : 0
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProjectBrief({ data }: { data: Record<string, unknown> }) {
  const name = typeof data.name === "string" ? data.name : null
  const description = typeof data.description === "string" ? data.description : null
  const goals = Array.isArray(data.goals) ? (data.goals as Array<Record<string, unknown>>) : []
  const scope = data.scope && typeof data.scope === "object" ? (data.scope as Record<string, unknown>) : null
  const scopeIn = scope && Array.isArray(scope.in) ? (scope.in as string[]) : []
  const scopeOut = scope && Array.isArray(scope.out) ? (scope.out as string[]) : []
  const constraints = Array.isArray(data.constraints) ? (data.constraints as Array<Record<string, unknown>>) : []
  const assumptions = Array.isArray(data.assumptions) ? (data.assumptions as Array<Record<string, unknown>>) : []

  return (
    <div className="flex flex-col gap-3">
      {name && <p className="text-sm font-semibold text-text-primary">{name}</p>}
      {description && <p className="text-xs leading-relaxed text-text-secondary">{description}</p>}

      {goals.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-faint">Goals</p>
          <ul className="flex flex-col gap-1">
            {goals.map((g, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                <span className="mt-0.5 font-mono text-[10px] text-accent-ai-text">
                  {typeof g.id === "string" ? g.id : `#${i + 1}`}
                </span>
                <span>{typeof g.statement === "string" ? g.statement : JSON.stringify(g)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(scopeIn.length > 0 || scopeOut.length > 0) && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-faint">Scope</p>
          <div className="flex flex-col gap-1">
            {scopeIn.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-1">
                <span className="text-[10px] font-medium text-emerald-400">IN</span>
                {scopeIn.map((s, i) => (
                  <span key={i} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {scopeOut.length > 0 && (
              <div className="flex flex-wrap items-baseline gap-1">
                <span className="text-[10px] font-medium text-red-400">OUT</span>
                {scopeOut.map((s, i) => (
                  <span key={i} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {constraints.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-faint">Constraints</p>
          <ul className="flex flex-col gap-1">
            {constraints.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                <span className="mt-0.5 shrink-0 rounded bg-bg-subtle px-1 py-px font-mono text-[9px] text-text-faint">
                  {typeof c.kind === "string" ? c.kind : "other"}
                </span>
                <span>{typeof c.statement === "string" ? c.statement : JSON.stringify(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {assumptions.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-faint">Assumptions</p>
          <ul className="flex flex-col gap-1">
            {assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                <span className="mt-0.5 font-mono text-[10px] text-amber-400">
                  {typeof a.id === "string" ? a.id : `#${i + 1}`}
                </span>
                <span>{typeof a.statement === "string" ? a.statement : JSON.stringify(a)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ActorsList({ data }: { data: Array<Record<string, unknown>> }) {
  if (data.length === 0) return <p className="text-xs text-text-faint italic">No actors defined yet.</p>
  return (
    <div className="flex flex-col gap-2">
      {data.map((actor, i) => (
        <div key={i} className="rounded-lg border border-border-subtle bg-bg-elevated p-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-accent-ai-text">
              {typeof actor.id === "string" ? actor.id : `#${i + 1}`}
            </span>
            <span className="text-xs font-medium text-text-primary">
              {typeof actor.name === "string" ? actor.name : "Unnamed"}
            </span>
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-medium",
              actor.kind === "system" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
            )}>
              {typeof actor.kind === "string" ? actor.kind : "human"}
            </span>
            {typeof actor.role === "string" && actor.role !== "" && (
              <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[9px] text-text-faint">
                {actor.role as string}
              </span>
            )}
          </div>
          {typeof actor.description === "string" && (
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{actor.description as string}</p>
          )}
          {Array.isArray(actor.goals) && (actor.goals as string[]).length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {(actor.goals as string[]).map((g, j) => (
                <li key={j} className="rounded-full bg-bg-subtle px-2 py-0.5 text-[9px] text-text-secondary">{g}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function ClarificationsList({ data }: { data: Array<Record<string, unknown>> }) {
  const answered = data.filter((c) => c.answer != null && c.answer !== "")
  const unanswered = data.filter((c) => c.answer == null || c.answer === "")

  return (
    <div className="flex flex-col gap-2">
      {answered.length + unanswered.length === 0 && (
        <p className="text-xs text-text-faint italic">No clarifications needed.</p>
      )}
      {unanswered.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">Pending</p>
          {unanswered.map((q, i) => (
            <div key={i} className="mb-1.5 rounded-lg border border-amber-500/10 bg-amber-500/5 p-2.5">
              <p className="text-xs font-medium text-text-primary">
                {typeof q.question === "string" ? q.question : `Question #${i + 1}`}
              </p>
              {typeof q.why === "string" && (
                <p className="mt-0.5 text-[10px] text-text-faint">{q.why as string}</p>
              )}
              {q.blocking === true && (
                <span className="mt-1 inline-block rounded bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400">
                  Blocking
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {answered.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">Answered</p>
          {answered.map((q, i) => (
            <div key={i} className="mb-1.5 rounded-lg border border-border-subtle bg-bg-elevated p-2.5">
              <p className="text-xs font-medium text-text-primary">
                {typeof q.question === "string" ? q.question : `Question #${i + 1}`}
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-400">
                {typeof q.answer === "string" ? q.answer : String(q.answer ?? "")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RequirementsList({ data }: { data: Array<Record<string, unknown>> }) {
  if (data.length === 0) return <p className="text-xs text-text-faint italic">No requirements defined yet.</p>
  return (
    <div className="flex flex-col gap-2">
      {data.map((req, i) => (
        <div key={i} className="rounded-lg border border-border-subtle bg-bg-elevated p-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-accent-ai-text">
              {typeof req.id === "string" ? req.id : `#${i + 1}`}
            </span>
            {typeof req.priority === "string" && req.priority !== "" && (
              <span className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-medium",
                req.priority === "must-have" || req.priority === "critical"
                  ? "bg-red-500/10 text-red-400"
                  : req.priority === "should-have"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-bg-subtle text-text-faint"
              )}>
                {req.priority as string}
              </span>
            )}
            {typeof req.kind === "string" && req.kind !== "" && (
              <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[9px] text-text-faint">{req.kind as string}</span>
            )}
          </div>
          {typeof req.title === "string" && (
            <p className="mt-1 text-xs font-medium text-text-primary">{req.title as string}</p>
          )}
          {typeof req.description === "string" && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{req.description as string}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function UserStoriesList({ data }: { data: Array<Record<string, unknown>> }) {
  if (data.length === 0) return <p className="text-xs text-text-faint italic">No user stories defined yet.</p>
  return (
    <div className="flex flex-col gap-2">
      {data.map((story, i) => (
        <div key={i} className="rounded-lg border border-border-subtle bg-bg-elevated p-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-accent-ai-text">
              {typeof story.id === "string" ? story.id : `#${i + 1}`}
            </span>
            {typeof story.epic === "string" && story.epic !== "" && (
              <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] text-purple-400">{story.epic as string}</span>
            )}
            {story.points != null && (
              <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[9px] text-text-faint">
                {String(story.points)} pts
              </span>
            )}
          </div>
          {typeof story.story === "string" && (
            <p className="mt-1 text-xs text-text-secondary">{story.story as string}</p>
          )}
          {Array.isArray(story.scenarios) && (story.scenarios as Array<Record<string, unknown>>).length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {(story.scenarios as Array<Record<string, unknown>>).map((s, j) => (
                <p key={j} className="text-[10px] text-text-faint">
                  <span className="font-medium">
                    {typeof s.kind === "string" ? (s.kind === "given" ? "GIVEN" : s.kind === "when" ? "WHEN" : "THEN") : `Step ${j + 1}`}
                  </span>
                  {" "}{typeof s.statement === "string" ? s.statement : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function BusinessRulesList({ data }: { data: Array<Record<string, unknown>> }) {
  if (data.length === 0) return <p className="text-xs text-text-faint italic">No business rules defined yet.</p>
  return (
    <div className="flex flex-col gap-2">
      {data.map((rule, i) => (
        <div key={i} className="rounded-lg border border-border-subtle bg-bg-elevated p-2.5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-mono text-[10px] text-accent-ai-text">
              {typeof rule.id === "string" ? rule.id : `#${i + 1}`}
            </span>
            <span className="text-xs text-text-secondary">
              {typeof rule.statement === "string" ? rule.statement : JSON.stringify(rule)}
            </span>
          </div>
          {Array.isArray(rule.appliesTo) && (rule.appliesTo as string[]).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(rule.appliesTo as string[]).map((t, j) => (
                <span key={j} className="rounded-full bg-bg-subtle px-2 py-0.5 text-[9px] text-text-faint">{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  meta,
  status,
  count,
  defaultOpen = false,
  children,
}: {
  meta: SectionMeta
  status: string | undefined
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const badge = statusBadge(status)

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface/60">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-bg-subtle/50"
      >
        <span className="text-text-muted">{meta.icon}</span>
        <span className="flex-1 text-xs font-medium text-text-primary">{meta.label}</span>
        {count > 0 && (
          <span className="rounded-full bg-bg-subtle px-1.5 py-0.5 text-[10px] text-text-faint">{count}</span>
        )}
        <span className={cn("flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium", badge.color)}>
          {badge.icon}
          {badge.label}
        </span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-border-subtle px-3 py-2.5">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MemoryTabProps {
  projectId: string
}

export function MemoryTab({ projectId }: MemoryTabProps) {
  const [memory, setMemory] = useState<MemoryData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMemory = useCallback(() => {
    setIsLoading(true)
    setError(null)
    fetch(`/api/projects/${projectId}/memory`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) { setMemory(null); setIsLoading(false); return }
          throw new Error(`Failed to load memory (${res.status})`)
        }
        return res.json().then((data: MemoryData) => {
          setMemory(data)
          setIsLoading(false)
        })
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load memory")
        setIsLoading(false)
      })
  }, [projectId])

  const fetchedRef = useRef<string | null>(null)

  useEffect(() => {
    if (fetchedRef.current === projectId) return
    fetchedRef.current = projectId
    setIsLoading(true)
    setError(null)
    fetch(`/api/projects/${projectId}/memory`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) { setMemory(null); setIsLoading(false); return }
          throw new Error(`Failed to load memory (${res.status})`)
        }
        return res.json().then((data: MemoryData) => {
          setMemory(data)
          setIsLoading(false)
        })
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load memory")
        setIsLoading(false)
      })
  }, [projectId])

  const sectionStatus = memory?.runState?.sectionStatus ?? {}
  const phase = memory?.runState?.phase ?? null

  const renderSectionContent = (key: SectionKey, data: unknown) => {
    if (data == null) return <p className="text-xs text-text-faint italic">No data yet.</p>
    switch (key) {
      case "project":
        return <ProjectBrief data={data as Record<string, unknown>} />
      case "actors":
        return <ActorsList data={Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []} />
      case "clarifications":
        return <ClarificationsList data={Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []} />
      case "requirements":
        return <RequirementsList data={Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []} />
      case "userStories":
        return <UserStoriesList data={Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []} />
      case "businessRules":
        return <BusinessRulesList data={Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []} />
      case "entities":
        return Array.isArray(data) && data.length > 0
          ? (
            <div className="flex flex-col gap-2">
              {data.map((e, i) => (
                <div key={i} className="rounded-lg border border-border-subtle bg-bg-elevated p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-accent-ai-text">
                      {typeof e.id === "string" ? e.id : `#${i + 1}`}
                    </span>
                    <span className="text-xs font-medium text-text-primary">
                      {typeof e.name === "string" ? e.name : "Unnamed"}
                    </span>
                    {e.kind && typeof e.kind === "string" && (
                      <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[9px] text-text-faint">{e.kind}</span>
                    )}
                  </div>
                  {e.description && typeof e.description === "string" && (
                    <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{e.description}</p>
                  )}
                </div>
              ))}
            </div>
          )
          : <p className="text-xs text-text-faint italic">No entities defined yet.</p>
      default:
        return <p className="text-xs text-text-faint italic">Unsupported section type.</p>
    }
  }

  const hasAnyData = memory !== null && SECTIONS.some((s) => {
    const val = memory[s.key]
    return val != null && !(Array.isArray(val) && val.length === 0)
  })

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-4 pt-3 pb-2">
          {/* ── Header ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-text-muted" />
              <span className="text-xs font-medium text-text-primary">Memory</span>
              {phase && (
                <span className="rounded-full bg-accent-ai/10 px-1.5 py-0.5 text-[9px] font-medium text-accent-ai-text">
                  {phase}
                </span>
              )}
            </div>
            <button
              onClick={fetchMemory}
              disabled={isLoading}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-bg-subtle hover:text-text-secondary disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            </button>
          </div>

          {/* ── Loading ──────────────────────────────────────────────── */}
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
              <p className="text-xs text-text-muted">Loading memory…</p>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────── */}
          {error && !isLoading && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
              <XCircle className="h-5 w-5 text-red-400" />
              <p className="text-xs text-red-400">{error}</p>
              <button
                onClick={fetchMemory}
                className="text-[10px] text-red-400 underline transition-colors hover:text-red-300"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Empty state ──────────────────────────────────────────── */}
          {!isLoading && !error && !hasAnyData && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Database className="h-8 w-8 text-text-faint" />
              <div>
                <p className="text-sm font-medium text-text-primary">No Memory Yet</p>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  Launch a pipeline run to populate the shared memory with project
                  requirements, user stories, and more.
                </p>
              </div>
            </div>
          )}

          {/* ── Section cards ────────────────────────────────────────── */}
          {!isLoading && !error && memory && SECTIONS.map((section) => {
            const data = memory[section.key]
            const count = formatCount(data)
            const status = sectionStatus[section.key]
            const hasContent = data != null && count > 0

            return (
              <SectionCard
                key={section.key}
                meta={section}
                status={status}
                count={count}
                defaultOpen={hasContent && (section.key === "project" || section.key === "requirements")}
              >
                {renderSectionContent(section.key, data)}
              </SectionCard>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
