"use client";

import { useEffect, useRef, useState } from "react";
import { ChatSidebar, type SessionSummary } from "./chat-sidebar";
import { ConfirmDialog } from "./confirm-dialog";
import { Markdown } from "./markdown";
import { UsageHud, CONTEXT_LIMIT } from "./usage-hud";

const MODELS = [
  { key: "default", label: "기본 모델 (Opus)" },
  { key: "sonnet", label: "Sonnet" },
  { key: "opus", label: "Opus" },
  { key: "haiku", label: "Haiku" },
];

type Mode = "produce" | "socratic" | "drill";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ArtifactLink {
  id: number;
  title: string;
  kind: "html" | "note";
}

interface RelatedArtifact extends ArtifactLink {
  created_at?: string;
  taxonomy_path?: string | null;
}


const LAST_SESSION_KEY = "techtalk-last-session";

const MODES: { key: Mode; label: string; desc: string }[] = [
  { key: "produce", label: "① 바로산출물", desc: "전문가 토론 HTML + 학습노트 생성" },
  { key: "socratic", label: "② 소크라테스", desc: "힌트만으로 원리를 스스로 재발명" },
  { key: "drill", label: "③ 실무", desc: "함정 섞인 시나리오로 판단 훈련" },
];

export default function ChatPage() {
  const [mode, setMode] = useState<Mode>("socratic");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactLink[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [model, setModel] = useState("default");
  const [related, setRelated] = useState<RelatedArtifact[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const [hudKey, setHudKey] = useState(0);
  const [compacting, setCompacting] = useState(false);
  const [compactNotice, setCompactNotice] = useState<{
    trigger: "manual" | "auto";
    preTokens: number;
    postTokens: number | null;
  } | null>(null);
  const [compactError, setCompactError] = useState<string | null>(null);
  const [me, setMe] = useState<{
    username: string;
    subscriptionBound: boolean;
  } | null>(null);
  // 전송 실패 시 복구용: 배너 표시 + 재시도할 메시지 보관
  const [sendError, setSendError] = useState<{
    message: string;
    failed: string;
  } | null>(null);
  // 빈 화면에서 보여줄 추천 주제 칩 (미커버 소주제 앞에서부터)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // 확인 다이얼로그: 세션 삭제 / 새 대화
  const [confirmAction, setConfirmAction] = useState<
    { kind: "delete"; id: number } | { kind: "reset" } | null
  >(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  // 사용자가 위로 스크롤해 읽는 중이면 자동 스크롤을 멈춘다
  const stickToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // 세션 복원: DB에 저장된 이력을 불러와 이어간다 (SDK resume으로 맥락 유지)
  async function loadSession(id: number) {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) {
      localStorage.removeItem(LAST_SESSION_KEY);
      return;
    }
    const data = await res.json();
    setSessionId(data.session.id);
    setMode(data.session.mode);
    setMessages(data.messages);
    setArtifacts(data.artifacts);
    setModel(data.session.model ?? "default");
    setContextTokens(data.session.context_tokens ?? null);
    fetchRelated(data.session.topic ?? "");
    // 세션 주제가 트리 소주제와 정확히 일치하면 트리에서도 표시됨
    setSelectedTopic(data.session.topic ?? null);
    setSendError(null);
    setCompactNotice(null);
    setCompactError(null);
    localStorage.setItem(LAST_SESSION_KEY, String(data.session.id));
    stickToBottomRef.current = true;
    scrollToBottom(true);
  }

  const refreshSessions = () =>
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []));

  // 현재 주제와 관련된 (과거 세션 포함) 산출물 조회 → 우측 패널
  const fetchRelated = (topic: string) => {
    if (!topic.trim()) return setRelated([]);
    fetch(`/api/artifacts/search?q=${encodeURIComponent(topic)}`)
      .then((r) => r.json())
      .then((d) => setRelated(d.artifacts ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    // 대시보드 등에서 진입: ?session=<id> 세션 열기, ?topic=<주제> 입력 프리필
    // (아래 /api/me 콜백에서 "세션 복원 중이라 모델 선호값을 덮지 말지" 판단에 재사용)
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get("session");
    const topicParam = params.get("topic");
    const restoringSession =
      Boolean(sessionParam) ||
      (!topicParam && Boolean(localStorage.getItem(LAST_SESSION_KEY)));

    // 로그인 게이트: 미로그인 → /login, 구독 미연결 → 배너 표시
    fetch("/api/me").then(async (r) => {
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      const d = await r.json();
      // 미연결이면 구독 연결부터 (채팅·주제 트리를 노출하지 않음)
      if (!d.subscriptionBound) {
        window.location.href = "/auth";
        return;
      }
      // 연결됐는데 온보딩 미완료면 주제 설정으로
      if (!d.onboarded) {
        window.location.href = "/onboarding";
        return;
      }
      setMe({
        username: d.user.username,
        subscriptionBound: d.subscriptionBound,
      });
      // 모델 선호값(계정에 저장된 값) 복원 — 세션 복원 중이면 그 세션 값이 우선
      if (!restoringSession && d.defaultModel) setModel(d.defaultModel);
    });
    refreshSessions();
    // 추천 주제 칩: 주제 트리에서 아직 안 다룬 소주제 앞 4개
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then((d) => {
        const leaves = (
          (d.tree ?? []) as {
            mids: { leaves: { name: string; covered: boolean }[] }[];
          }[]
        ).flatMap((t) => t.mids.flatMap((m) => m.leaves));
        setSuggestions(
          leaves.filter((l) => !l.covered).slice(0, 4).map((l) => l.name)
        );
      })
      .catch(() => {});
    if (sessionParam || topicParam) {
      window.history.replaceState(null, "", "/");
    }
    if (sessionParam) {
      // 마운트 시 1회 세션 복원(fetch 후 setState) — 동기 setState 아님
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadSession(Number(sessionParam));
      return;
    }
    if (topicParam) {
      setInput(topicParam);
      setSelectedTopic(topicParam);
    }
    const last = localStorage.getItem(LAST_SESSION_KEY);
    if (last && !topicParam) loadSession(Number(last));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function deleteSession(id: number) {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (id === sessionId) reset();
    refreshSessions();
  }

  const scrollToBottom = (force = false) => {
    if (!force && !stickToBottomRef.current) return;
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    );
  };

  const handleScroll = () => {
    const el = scrollBoxRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  async function send(overrideMessage?: string) {
    const message = (overrideMessage ?? input).trim();
    if (!message || busy) return;
    if (overrideMessage === undefined || input.trim() === message) setInput("");
    setBusy(true);
    setToolStatus(null);
    setSendError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    stickToBottomRef.current = true;
    scrollToBottom(true);

    const ac = new AbortController();
    abortRef.current = ac;
    let receivedAny = false;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, mode, message, model }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`요청 실패 (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          if (!raw.startsWith("data: ")) continue;
          const ev = JSON.parse(raw.slice(6));

          if (ev.type === "text") {
            receivedAny = true;
            setToolStatus(null);
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: "assistant",
                content: next[next.length - 1].content + ev.text,
              };
              return next;
            });
            scrollToBottom();
          } else if (ev.type === "tool") {
            setToolStatus(`도구 실행 중: ${ev.name}`);
          } else if (ev.type === "compact") {
            // 자동 압축 — SDK가 대화 중 알아서 요약한 경우도 여기서 감지됨
            setCompactNotice({
              trigger: ev.trigger,
              preTokens: ev.preTokens,
              postTokens: ev.postTokens ?? null,
            });
          } else if (ev.type === "done") {
            if (sessionId === null) fetchRelated(message);
            setSessionId(ev.sessionId);
            localStorage.setItem(LAST_SESSION_KEY, String(ev.sessionId));
            if (ev.artifacts?.length) {
              setArtifacts((prev) => [...prev, ...ev.artifacts]);
            }
            if (typeof ev.contextTokens === "number") {
              setContextTokens(ev.contextTokens);
            }
            setHudKey((k) => k + 1);
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
    } catch (e) {
      if (ac.signal.aborted) {
        // 사용자가 중단: 부분 응답은 유지, 빈 말풍선만 제거
        if (!receivedAny) setMessages((prev) => prev.slice(0, -1));
      } else {
        // 실패: 아무 응답도 없으면 말풍선을 걷어내고 입력을 복원해 다시 보낼 수 있게 한다
        if (!receivedAny) {
          setMessages((prev) => prev.slice(0, -2));
          setInput((cur) => (cur.trim() ? cur : message));
        }
        setSendError({
          message: e instanceof Error ? e.message : String(e),
          failed: message,
        });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setToolStatus(null);
      scrollToBottom();
    }
  }

  // 수동 압축: CLI의 /compact와 동일 — 대화창엔 흔적을 남기지 않고
  // 컨텍스트만 요약해 다음 턴부터 가볍게 만든다.
  async function runCompact() {
    if (!sessionId || busy || compacting) return;
    setCompacting(true);
    setCompactError(null);
    try {
      const res = await fetch("/api/compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? `요청 실패 (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          if (!raw.startsWith("data: ")) continue;
          const ev = JSON.parse(raw.slice(6));
          if (ev.type === "compact") {
            setCompactNotice({
              trigger: ev.trigger,
              preTokens: ev.preTokens,
              postTokens: ev.postTokens ?? null,
            });
            if (typeof ev.postTokens === "number") setContextTokens(ev.postTokens);
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
    } catch (e) {
      setCompactError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompacting(false);
    }
  }

  function reset() {
    setSessionId(null);
    setMessages([]);
    setArtifacts([]);
    setToolStatus(null);
    setSendError(null);
    setContextTokens(null);
    setRelated([]);
    setSelectedTopic(null);
    setCompactNotice(null);
    setCompactError(null);
    localStorage.removeItem(LAST_SESSION_KEY);
  }

  // 사이드바 열림 상태: null = 기본값 (데스크톱 열림, 모바일 닫힘)
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null);
  const desktopSidebarOpen = sidebarOpen ?? true;
  const mobileSidebarOpen = sidebarOpen ?? false;

  const isDesktop = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px)").matches;

  const toggleSidebar = () =>
    setSidebarOpen(!(isDesktop() ? desktopSidebarOpen : mobileSidebarOpen));

  // 모바일 드로어에서 항목을 고르면 드로어를 닫는다
  const closeSidebarOnMobile = () => {
    if (!isDesktop()) setSidebarOpen(false);
  };

  const sidebar = (
    <ChatSidebar
      selectedTopic={selectedTopic}
      onPickTopic={(topic) => {
        setInput(topic);
        setSelectedTopic(topic);
        closeSidebarOnMobile();
      }}
      sessions={sessions}
      currentSessionId={sessionId}
      onSelectSession={(id) => {
        loadSession(id);
        closeSidebarOnMobile();
      }}
      onDeleteSession={(id) => setConfirmAction({ kind: "delete", id })}
    />
  );

  return (
    <div className="flex h-full flex-col">
      {/* 채팅 툴바: 채팅 전용 컨트롤 (전역 네비는 layout의 AppHeader) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-4 py-1.5 dark:border-neutral-800">
        <button
          onClick={toggleSidebar}
          className="rounded p-1 text-lg leading-none text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          title={desktopSidebarOpen ? "주제·세션 패널 닫기" : "주제·세션 패널 열기"}
          aria-label="주제·세션 패널 토글"
          aria-expanded={desktopSidebarOpen}
        >
          {desktopSidebarOpen ? "«" : "☰"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <UsageHud refreshKey={hudKey} contextTokens={contextTokens} />
          <select
            value={model}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value;
              setModel(next);
              // 계정에 저장 — 기기·브라우저 바뀌어도, 캐시 지워도 유지됨
              fetch("/api/me", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ defaultModel: next }),
              }).catch(() => {});
            }}
            title="사용 모델 (대화 중에도 변경 가능)"
            className="rounded border border-neutral-300 bg-transparent p-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          >
            {MODELS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          {sessionId !== null && (
            <button
              onClick={runCompact}
              disabled={busy || compacting}
              title="대화를 요약해 컨텍스트를 줄입니다 (CLI의 /compact와 동일)"
              className={
                "rounded border px-2.5 py-1 text-sm disabled:opacity-40 " +
                (contextTokens !== null && contextTokens / CONTEXT_LIMIT >= 0.7
                  ? "border-amber-400 text-amber-500 hover:bg-amber-500/10"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800")
              }
            >
              {compacting ? "압축 중…" : "압축"}
            </button>
          )}
          <button
            onClick={() =>
              messages.length > 0
                ? setConfirmAction({ kind: "reset" })
                : reset()
            }
            className="rounded border border-neutral-300 px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            새 대화
          </button>
          {sessionId !== null && (
            <button
              onClick={() => setConfirmAction({ kind: "delete", id: sessionId })}
              disabled={busy}
              className="text-sm text-red-400 hover:underline disabled:opacity-40"
              title="현재 세션을 목록에서 삭제"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      {/* 본문: 좌측 주제 패널 + 채팅 영역 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 데스크톱: 인라인 사이드바 */}
        {desktopSidebarOpen && (
          <aside className="hidden w-72 shrink-0 border-r border-neutral-200 md:block dark:border-neutral-800">
            {sidebar}
          </aside>
        )}
        {/* 모바일: 오버레이 드로어 */}
        {mobileSidebarOpen && (
          <div className="md:hidden">
            <div
              className="fixed inset-0 z-30 bg-black/40"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
            <aside className="fixed inset-y-0 left-0 z-40 w-72 border-r border-neutral-200 bg-background dark:border-neutral-800">
              {sidebar}
            </aside>
          </div>
        )}

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden p-4">

      {/* 모드 선택: 세션 시작 전에만 변경 가능 (스킬의 '방식 먼저 확정' 규약)
          세션이 시작되면 카드 대신 현재 모드 배지로 축소해 채팅 공간을 확보 */}
      {sessionId === null ? (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              title={m.desc}
              className={`rounded-lg border p-2 text-left text-xs transition ${
                mode === m.key
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-neutral-300 hover:border-blue-400 dark:border-neutral-700"
              }`}
            >
              <div className="font-semibold">{m.label}</div>
              <div className="mt-0.5 text-neutral-500">{m.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 font-medium text-blue-500">
            {MODES.find((m) => m.key === mode)?.label ?? mode}
          </span>
          <span
            className="text-neutral-500"
            title="진행 방식의 일관성을 위해 세션 시작 시 모드가 고정됩니다"
          >
            모드는 세션 시작 시 고정 — 바꾸려면 새 대화를 시작하세요
          </span>
        </div>
      )}

      {/* 구독 미연결 게이트: 본인 토큰 없이는 대화 불가 (폴백 없음) */}
      {me && !me.subscriptionBound && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          아직 Claude 구독이 연결되지 않았습니다. 대화하려면{" "}
          <a href="/auth" className="font-medium text-blue-500 hover:underline">
            구독 연결
          </a>
          을 먼저 완료하세요. (본인 Claude 계정으로 1회, 만료 전까지 유지)
        </div>
      )}

      <div
        ref={scrollBoxRef}
        onScroll={handleScroll}
        aria-live="polite"
        className="slim-scroll flex-1 space-y-4 overflow-y-auto rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      >
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">
              주제를 입력하면 선택한 방식으로 시작합니다. (예: &quot;B+Tree
              인덱스&quot;, &quot;kafka 컨슈머 그룹 리밸런싱&quot;)
            </p>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s);
                      setSelectedTopic(s);
                    }}
                    title="클릭하면 입력창에 주제가 들어갑니다"
                    className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-blue-400 hover:text-blue-500 dark:border-neutral-700 dark:text-neutral-400"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-blue-500/10 p-3 text-sm leading-relaxed"
            >
              {m.content}
            </div>
          ) : (
            <div
              key={i}
              className="border-l-2 border-neutral-200 pl-3 text-sm leading-relaxed dark:border-neutral-800"
            >
              {m.content ? (
                <Markdown text={m.content} />
              ) : busy && i === messages.length - 1 ? (
                <span className="text-neutral-400">
                  {toolStatus ?? "생각 중…"}
                </span>
              ) : null}
            </div>
          )
        )}
        {artifacts.length > 0 && (
          <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-3 text-sm">
            <div className="mb-1 font-semibold">생성된 산출물</div>
            {artifacts.map((a) => (
              <a
                key={a.id}
                href={`/artifacts/${a.id}`}
                target="_blank"
                className="block text-blue-500 hover:underline"
              >
                {a.kind === "html" ? "🌐" : "📝"} {a.title}
              </a>
            ))}
          </div>
        )}
        {compactNotice && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-400/40 bg-blue-500/5 p-3 text-sm">
            <span>
              {compactNotice.trigger === "auto" ? "자동 압축됨: " : "압축 완료: "}
              {Math.round(compactNotice.preTokens / 1000)}k
              {compactNotice.postTokens !== null
                ? ` → ${Math.round(compactNotice.postTokens / 1000)}k`
                : ""}
            </span>
            <button
              onClick={() => setCompactNotice(null)}
              className="shrink-0 text-xs text-neutral-500 hover:underline"
            >
              닫기
            </button>
          </div>
        )}
        {compactError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">
            <span className="min-w-0 truncate" title={compactError}>
              압축 실패: {compactError}
            </span>
            <button
              onClick={runCompact}
              className="shrink-0 rounded border border-red-400 px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/10"
            >
              재시도
            </button>
          </div>
        )}
        {sendError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">
            <span className="min-w-0 truncate" title={sendError.message}>
              오류: {sendError.message}
            </span>
            <button
              onClick={() =>
                input.trim() ? send() : send(sendError.failed)
              }
              className="shrink-0 rounded border border-red-400 px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/10"
            >
              재시도
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 중 Enter는 무시 (마지막 글자 중복 전송 방지)
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="메시지 입력 (Enter로 전송)"
          className="flex-1 resize-none rounded-lg border border-neutral-300 bg-transparent p-3 text-sm outline-none focus:border-blue-500 dark:border-neutral-700"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="응답 생성을 중단합니다 (받은 부분까지는 유지)"
          >
            중단
          </button>
        ) : (
          <button
            type="submit"
            disabled={
              !input.trim() || (me !== null && !me.subscriptionBound)
            }
            className="rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            전송
          </button>
        )}
        </form>
      </main>

      {/* 우측 산출물 패널: 이 세션 산출물 + 같은 주제의 과거 산출물 */}
      {(artifacts.length > 0 || related.length > 0) && (
        <aside className="slim-scroll hidden w-64 shrink-0 overflow-y-auto border-l border-neutral-200 p-3 lg:block dark:border-neutral-800">
          <h2 className="mb-2 text-sm font-semibold">산출물</h2>
          {artifacts.length > 0 && (
            <div className="mb-4">
              <div className="mb-1 text-[11px] font-medium text-emerald-500">
                이 세션에서 생성
              </div>
              <ul className="space-y-1">
                {artifacts.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/artifacts/${a.id}`}
                      target="_blank"
                      className="block truncate rounded px-1 py-0.5 text-xs text-blue-500 hover:bg-blue-500/10"
                      title={a.title}
                    >
                      {a.kind === "html" ? "🌐" : "📝"} {a.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {related.filter((r) => !artifacts.some((a) => a.id === r.id))
            .length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium text-neutral-500">
                이 주제의 기존 산출물
              </div>
              <ul className="space-y-1">
                {related
                  .filter((r) => !artifacts.some((a) => a.id === r.id))
                  .map((r) => (
                    <li key={r.id}>
                      <a
                        href={`/artifacts/${r.id}`}
                        target="_blank"
                        className="block rounded px-1 py-0.5 text-xs hover:bg-blue-500/10"
                        title={r.title}
                      >
                        <span className="block truncate text-blue-500">
                          {r.kind === "html" ? "🌐" : "📝"} {r.title}
                        </span>
                        <span className="block truncate text-[10px] text-neutral-500">
                          {r.taxonomy_path}
                          {r.created_at ? ` · ${r.created_at.slice(0, 10)}` : ""}
                        </span>
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </aside>
      )}
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.kind === "delete"
            ? "세션을 삭제할까요?"
            : "새 대화를 시작할까요?"
        }
        description={
          confirmAction?.kind === "delete"
            ? "목록에서만 사라지며 생성된 산출물은 유지됩니다."
            : "현재 대화는 화면에서 사라지지만 세션 목록에서 다시 열 수 있습니다."
        }
        confirmLabel={confirmAction?.kind === "delete" ? "삭제" : "새 대화"}
        danger={confirmAction?.kind === "delete"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.kind === "delete") deleteSession(confirmAction.id);
          else reset();
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
