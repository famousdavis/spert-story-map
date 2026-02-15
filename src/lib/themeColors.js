/**
 * Centralized theme color definitions.
 * Each option maps a key to Tailwind classes for different contexts.
 */

export const THEME_COLOR_OPTIONS = [
  {
    key: 'blue',
    solid: 'bg-blue-600',
    light: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    dot: 'bg-blue-400',
    swatch: 'bg-blue-500',
  },
  {
    key: 'teal',
    solid: 'bg-teal-600',
    light: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
    dot: 'bg-teal-400',
    swatch: 'bg-teal-500',
  },
  {
    key: 'violet',
    solid: 'bg-violet-600',
    light: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    dot: 'bg-violet-400',
    swatch: 'bg-violet-500',
  },
  {
    key: 'rose',
    solid: 'bg-rose-600',
    light: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    dot: 'bg-rose-400',
    swatch: 'bg-rose-500',
  },
  {
    key: 'amber',
    solid: 'bg-amber-600',
    light: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    dot: 'bg-amber-400',
    swatch: 'bg-amber-500',
  },
  {
    key: 'emerald',
    solid: 'bg-emerald-600',
    light: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    dot: 'bg-emerald-400',
    swatch: 'bg-emerald-500',
  },
  {
    key: 'indigo',
    solid: 'bg-indigo-600',
    light: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
    dot: 'bg-indigo-400',
    swatch: 'bg-indigo-500',
  },
  {
    key: 'orange',
    solid: 'bg-orange-600',
    light: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
    dot: 'bg-orange-400',
    swatch: 'bg-orange-500',
  },
];

export const DEFAULT_THEME_COLOR_KEYS = THEME_COLOR_OPTIONS.map(o => o.key);

const colorMap = Object.fromEntries(THEME_COLOR_OPTIONS.map(o => [o.key, o]));

/**
 * Resolve a theme's color option object.
 * Uses theme.color if set, otherwise falls back to index-based cycling.
 */
export function getThemeColorClasses(theme, index) {
  if (theme?.color && colorMap[theme.color]) return colorMap[theme.color];
  return THEME_COLOR_OPTIONS[index % THEME_COLOR_OPTIONS.length];
}
