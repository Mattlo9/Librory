import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUiStore } from '@/store/uiStore';
import type { ThemePreference } from '@/types/domain';

interface ThemeMenuProps {
  variant?: 'outline' | 'ghost';
  size?: 'icon-sm' | 'icon-xs';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
};

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
];

/**
 * Dropdown selector for Light / Dark / System theme preference.
 * Uses native `title` so it works both inside and outside SidebarProvider's TooltipProvider.
 */
export function ThemeMenu({
  variant = 'outline',
  size = 'icon-sm',
  align = 'end',
  className,
}: ThemeMenuProps) {
  const rawTheme = useUiStore((s) => s.theme);
  const theme: ThemePreference =
    rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system'
      ? rawTheme
      : 'dark';
  const setTheme = useUiStore((s) => s.setTheme);

  const ActiveIcon =
    theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          aria-label={`Cambiar tema (actual: ${THEME_LABELS[theme]})`}
          title={`Tema: ${THEME_LABELS[theme]}`}
          className={className}
        >
          <ActiveIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-40">
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
          Apariencia
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemePreference)}
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="text-xs">
              <Icon className="mr-1.5 size-3.5 text-muted-foreground" />
              <span>{label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
