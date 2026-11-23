import {
  BarChart3,
  BookOpen,
  Check,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatClock } from '@/features/pomodoro/lib/formatTime';
import {
  useCreateStudySession,
  usePomodoroBookOptions,
} from '@/features/stats/hooks/useStudyStats';
import { cn } from '@/lib/utils';
import { isTauriRuntime } from '@/services/db';
import { usePomodoroStore } from '@/store/pomodoroStore';
import { useUiStore } from '@/store/uiStore';
import type { PomodoroPhase } from '@/types/domain';

interface PomodoroWidgetProps {
  variant?: 'header' | 'reader';
}

const PHASE_OPTIONS: Array<{ value: PomodoroPhase; label: string }> = [
  { value: 'focus', label: 'Enfoque' },
  { value: 'short_break', label: 'Corto' },
  { value: 'long_break', label: 'Largo' },
];

const PRESETS = [
  { label: '25 / 5', focus: 25, short: 5, long: 15 },
  { label: '50 / 10', focus: 50, short: 10, long: 20 },
  { label: '15 / 3', focus: 15, short: 3, long: 10 },
] as const;

interface DurationFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (next: number) => void;
}

function DurationField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: DurationFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    onCommit(clamped);
  };

  return (
    <label htmlFor={id} className="space-y-1 text-[11px] text-muted-foreground">
      <span className="block">{label}</span>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          }
        }}
        className="h-7 px-2 font-mono text-xs tabular-nums"
      />
    </label>
  );
}

/**
 * Global Pomodoro timer trigger pill + popover panel.
 * Uses native `title` attributes instead of Radix Tooltip so it works inside both
 * the main library shell and isolated reader views (outside SidebarProvider).
 */
export function PomodoroWidget({ variant = 'header' }: PomodoroWidgetProps) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const phase = usePomodoroStore((s) => s.phase);
  const status = usePomodoroStore((s) => s.status);
  const remainingSeconds = usePomodoroStore((s) => s.remainingSeconds);
  const plannedSeconds = usePomodoroStore((s) => s.plannedSeconds);
  const focusMinutes = usePomodoroStore((s) => s.focusMinutes);
  const shortBreakMinutes = usePomodoroStore((s) => s.shortBreakMinutes);
  const longBreakMinutes = usePomodoroStore((s) => s.longBreakMinutes);
  const cyclesBeforeLongBreak = usePomodoroStore(
    (s) => s.cyclesBeforeLongBreak,
  );
  const completedFocusCycles = usePomodoroStore((s) => s.completedFocusCycles);
  const soundEnabled = usePomodoroStore((s) => s.soundEnabled);
  const autoStartNext = usePomodoroStore((s) => s.autoStartNext);
  const readerBook = usePomodoroStore((s) => s.readerBook);
  const manualBookOverrideInReader = usePomodoroStore(
    (s) => s.manualBookOverrideInReader,
  );
  const linkedItemId = usePomodoroStore((s) => s.linkedItemId);
  const linkedItemTitle = usePomodoroStore((s) => s.linkedItemTitle);

  const start = usePomodoroStore((s) => s.start);
  const pause = usePomodoroStore((s) => s.pause);
  const reset = usePomodoroStore((s) => s.reset);
  const selectPhase = usePomodoroStore((s) => s.selectPhase);
  const skipPhase = usePomodoroStore((s) => s.skipPhase);
  const saveAndFinishPartial = usePomodoroStore((s) => s.saveAndFinishPartial);
  const setLinkedBook = usePomodoroStore((s) => s.setLinkedBook);
  const applyPreset = usePomodoroStore((s) => s.applyPreset);
  const updateSettings = usePomodoroStore((s) => s.updateSettings);
  const getElapsedFocusSeconds = usePomodoroStore(
    (s) => s.getElapsedFocusSeconds,
  );

  const navigate = useUiStore((s) => s.navigate);
  const bookOptionsQuery = usePomodoroBookOptions(open);
  const createStudySessionMutation = useCreateStudySession();

  const bookOptions = bookOptionsQuery.data ?? [];
  const effectiveBook =
    readerBook && !manualBookOverrideInReader
      ? readerBook
      : linkedItemId && linkedItemTitle
        ? { id: linkedItemId, title: linkedItemTitle }
        : null;

  const isAutoLinkedToReader = Boolean(readerBook && !manualBookOverrideInReader);
  const elapsedFocusSeconds = getElapsedFocusSeconds();
  const canSavePartial =
    phase === 'focus' && status !== 'idle' && elapsedFocusSeconds >= 60;
  const elapsedMinutesRounded = Math.max(1, Math.round(elapsedFocusSeconds / 60));

  const progressPct =
    plannedSeconds > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(((plannedSeconds - remainingSeconds) / plannedSeconds) * 100),
          ),
        )
      : 0;

  const cycleProgress =
    completedFocusCycles > 0 &&
    completedFocusCycles % cyclesBeforeLongBreak === 0 &&
    phase === 'long_break'
      ? cyclesBeforeLongBreak
      : completedFocusCycles % cyclesBeforeLongBreak;

  const isFocus = phase === 'focus';
  const phaseLabel =
    phase === 'focus'
      ? 'Enfoque'
      : phase === 'short_break'
        ? 'Descanso corto'
        : 'Descanso largo';

  const triggerTitle =
    status === 'idle'
      ? 'Abrir temporizador Pomodoro'
      : `${phaseLabel} · ${formatClock(remainingSeconds)}${effectiveBook ? ` · ${effectiveBook.title}` : ''}`;

  const handleSavePartial = async () => {
    const payload = saveAndFinishPartial();
    if (payload && isTauriRuntime()) {
      try {
        await createStudySessionMutation.mutateAsync(payload);
      } catch (error) {
        console.error('No se pudo guardar la sesión parcial:', error);
      }
    }
  };

  const handleOpenStats = () => {
    setOpen(false);
    navigate('stats');
  };

  const effectiveBookInOptions =
    effectiveBook && bookOptions.some((b) => b.id === effectiveBook.id);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={variant === 'reader' ? 'xs' : 'sm'}
          aria-label={triggerTitle}
          title={triggerTitle}
          className={cn(
            variant === 'header' ? 'h-8 gap-1.5 px-2.5 text-xs' : 'gap-1.5',
            status === 'running' &&
              isFocus &&
              'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300',
            status === 'running' &&
              !isFocus &&
              'border-sky-500/40 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300',
            status === 'paused' &&
              'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300',
          )}
        >
          {status === 'running' ? (
            <span
              aria-hidden="true"
              className={cn(
                'size-2 rounded-full animate-pulse',
                isFocus ? 'bg-emerald-500' : 'bg-sky-500',
              )}
            />
          ) : status === 'paused' ? (
            <Pause className="size-3" />
          ) : (
            <Timer className="size-3.5 text-muted-foreground" />
          )}

          {status === 'idle' ? (
            <span className="hidden sm:inline">Pomodoro</span>
          ) : (
            <span className="font-mono text-[11.5px] font-medium tabular-nums">
              {formatClock(remainingSeconds)}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 space-y-3.5 p-4">
        {/* Top bar: phases + sound + settings */}
        <div className="flex items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Fase del temporizador"
            className="flex items-center gap-0.5 rounded-lg bg-secondary/70 p-0.5"
          >
            {PHASE_OPTIONS.map((opt) => {
              const active = phase === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectPhase(opt.value)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={soundEnabled ? 'Silenciar sonido' : 'Activar sonido'}
              title={soundEnabled ? 'Silenciar aviso' : 'Activar sonido'}
              onClick={() => updateSettings({ soundEnabled: !soundEnabled })}
              className="text-muted-foreground hover:text-foreground"
            >
              {soundEnabled ? (
                <Volume2 className="size-3.5" />
              ) : (
                <VolumeX className="size-3.5" />
              )}
            </Button>

            <Button
              type="button"
              variant={settingsOpen ? 'secondary' : 'ghost'}
              size="icon-xs"
              aria-expanded={settingsOpen}
              aria-label="Ajustes del Pomodoro"
              title="Ajustes del temporizador"
              onClick={() => setSettingsOpen((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Clock & progress */}
        <div className="space-y-2.5 rounded-lg border border-border/60 bg-secondary/30 px-3.5 py-3 text-center">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{phaseLabel}</span>
            <div
              className="flex items-center gap-1"
              title={`Ciclos completados antes del descanso largo: ${cycleProgress} de ${cyclesBeforeLongBreak}`}
            >
              {Array.from({ length: cyclesBeforeLongBreak }, (_, index) => {
                const filled = index < cycleProgress;
                const activeCurrent =
                  index === cycleProgress && isFocus && status !== 'idle';
                return (
                  <span
                    key={index}
                    className={cn(
                      'size-1.5 rounded-full transition-colors',
                      filled
                        ? 'bg-emerald-500'
                        : activeCurrent
                          ? 'bg-emerald-500/45 ring-1 ring-emerald-500'
                          : 'bg-border',
                    )}
                  />
                );
              })}
            </div>
          </div>

          <div className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-foreground">
            {formatClock(remainingSeconds)}
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300',
                isFocus ? 'bg-emerald-500' : 'bg-sky-500',
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Main controls */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => (status === 'running' ? pause() : start())}
              className={cn(
                'flex-1 gap-1.5',
                isFocus &&
                  status !== 'running' &&
                  'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500',
              )}
            >
              {status === 'running' ? (
                <>
                  <Pause className="size-3.5" />
                  <span>Pausar</span>
                </>
              ) : (
                <>
                  <Play className="size-3.5 fill-current" />
                  <span>{status === 'paused' ? 'Reanudar' : 'Iniciar'}</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Reiniciar temporizador"
              title="Reiniciar bloque actual"
              disabled={status === 'idle' && remainingSeconds === plannedSeconds}
              onClick={reset}
            >
              <RotateCcw className="size-3.5" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Saltar fase"
              title="Saltar a la siguiente fase"
              onClick={skipPhase}
            >
              <SkipForward className="size-3.5" />
            </Button>
          </div>

          {canSavePartial ? (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={createStudySessionMutation.isPending}
              onClick={() => void handleSavePartial()}
              className="w-full gap-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
            >
              <Check className="size-3.5" />
              <span>Guardar y terminar ({elapsedMinutesRounded} min)</span>
            </Button>
          ) : null}
        </div>

        {/* Linked book selector */}
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="pomodoro-book-select"
              className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
            >
              <BookOpen className="size-3" />
              <span>Recurso de estudio</span>
            </label>
            {isAutoLinkedToReader ? (
              <Badge
                variant="secondary"
                className="h-4 rounded px-1.5 text-[10px] font-normal text-emerald-700 dark:text-emerald-300"
              >
                En lectura (auto)
              </Badge>
            ) : null}
          </div>

          <select
            id="pomodoro-book-select"
            value={effectiveBook?.id ?? ''}
            onChange={(e) => {
              const nextId = e.target.value;
              if (!nextId) {
                setLinkedBook(null);
                return;
              }
              if (readerBook && readerBook.id === nextId) {
                setLinkedBook(readerBook);
                return;
              }
              const match = bookOptions.find((b) => b.id === nextId);
              if (match) {
                setLinkedBook({ id: match.id, title: match.title });
              }
            }}
            className="h-8 w-full truncate rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="">Estudio libre (sin libro)</option>
            {effectiveBook && !effectiveBookInOptions ? (
              <option value={effectiveBook.id}>{effectiveBook.title}</option>
            ) : null}
            {bookOptions.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
                {book.author ? ` — ${book.author}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Expandable settings */}
        {settingsOpen ? (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Presets
              </span>
              <div className="flex items-center gap-1">
                {PRESETS.map((preset) => {
                  const isActivePreset =
                    focusMinutes === preset.focus &&
                    shortBreakMinutes === preset.short;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        applyPreset(preset.focus, preset.short, preset.long)
                      }
                      className={cn(
                        'rounded-md border px-2 py-0.5 font-mono text-[10.5px] transition-colors',
                        isActivePreset
                          ? 'border-emerald-500/45 bg-emerald-500/15 text-foreground'
                          : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <DurationField
                id="pomo-focus-min"
                label="Enfoque"
                value={focusMinutes}
                min={1}
                max={180}
                onCommit={(v) => updateSettings({ focusMinutes: v })}
              />
              <DurationField
                id="pomo-short-min"
                label="Corto"
                value={shortBreakMinutes}
                min={1}
                max={60}
                onCommit={(v) => updateSettings({ shortBreakMinutes: v })}
              />
              <DurationField
                id="pomo-long-min"
                label="Largo"
                value={longBreakMinutes}
                min={1}
                max={90}
                onCommit={(v) => updateSettings({ longBreakMinutes: v })}
              />
              <DurationField
                id="pomo-cycles"
                label="Ciclos"
                value={cyclesBeforeLongBreak}
                min={2}
                max={8}
                onCommit={(v) => updateSettings({ cyclesBeforeLongBreak: v })}
              />
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="flex cursor-pointer items-center justify-between rounded-md px-1 py-0.5 hover:bg-secondary/50">
                <span className="text-foreground">Iniciar siguiente fase automáticamente</span>
                <input
                  type="checkbox"
                  checked={autoStartNext}
                  onChange={(e) =>
                    updateSettings({ autoStartNext: e.target.checked })
                  }
                  className="size-3.5 accent-emerald-600"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md px-1 py-0.5 hover:bg-secondary/50">
                <span className="text-foreground">Sonido suave al terminar</span>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) =>
                    updateSettings({ soundEnabled: e.target.checked })
                  }
                  className="size-3.5 accent-emerald-600"
                />
              </label>
            </div>
          </div>
        ) : null}

        {/* Footer link */}
        <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
          <span>
            {completedFocusCycles > 0
              ? `${completedFocusCycles} ${completedFocusCycles === 1 ? 'ciclo en sesión' : 'ciclos en sesión'}`
              : 'Mín. 1 min para guardar parcial'}
          </span>
          <button
            type="button"
            onClick={handleOpenStats}
            className="inline-flex items-center gap-1 font-medium text-accent-brand hover:underline"
          >
            <BarChart3 className="size-3" />
            <span>Ver estadísticas</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
