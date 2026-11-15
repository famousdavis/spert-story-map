// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// A tile's Tile color button and the small non-modal popover it opens (v0.56.0): SPERT
// Forecaster's `TileColorControl.tsx` at 09c4cda, ported from GanttApp's at d437e84. Story Map
// adds only a disabled button with its reason (R88, a product id the settings cannot hold). It opens with focus on the checked radio. An
// arrow key picks at once and leaves the popover open; a mouse or touch pick closes it with focus
// on the button. Enter or Escape closes it and returns focus to the button; Tab, or a press
// outside it, closes it and leaves focus where it went.
//
// Two components where GanttApp has one, because of where the popover must sit. The button lives
// in the tile's revealed row, which is `relative z-[1]` (ABOVE_OPEN) to sit above the name
// button's `::after`. A popover inside that row would take the row as its containing block (so
// `right-1.5 top-[calc(100%-6px)]` would resolve against the row, not the tile) and would paint
// at the row's level 1, under the next tile's grip, Delete and revealed row. ProjectTile renders
// the popover beside the row instead, in the unpositioned actions bar: its containing block is the
// tile, as in GanttApp and the mock-up, and its `z-20` sits in the same stacking context as every
// tile's `z-[1]` controls.

import { useEffect, useId, useRef, type RefObject } from 'react'
import { TILE_COLORS, type TileColor } from '../../lib/projectPrefs'
import { COLOR_BUTTON, COLOR_DOT, POPOVER, POP_HINT, POP_TITLE, SWATCHES, SWATCH_BG, SW, SW_DOT, SW_NONE, SW_RADIO, NONE_DOT } from './tile-color-styles'

type ColorChoice = TileColor | 'none'

const CHOICES: readonly ColorChoice[] = [...TILE_COLORS, 'none']

const CHOICE_LABELS: Record<ColorChoice, string> = {
  blue: 'Blue',
  teal: 'Teal',
  slate: 'Slate',
  purple: 'Purple',
  pink: 'Pink',
  none: 'No color',
}

const choiceOf = (color: TileColor | undefined): ColorChoice => color ?? 'none'

interface TileColorButtonProps {
  projectName: string
  color: TileColor | undefined
  open: boolean
  buttonRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
  /** Why it is off (R88, a refused id), or null; with `reasonId`, the sr-only element holding it. */
  disabledReason?: string | null
  reasonId?: string
}

/** The Tile color button, named with the product: "Tile color for Alpha: Blue". */
export function TileColorButton({ projectName, color, open, buttonRef, onOpenChange, disabledReason = null, reasonId }: TileColorButtonProps) {
  const choice = choiceOf(color)
  return (
    <button
      ref={buttonRef}
      type="button"
      className={COLOR_BUTTON}
      aria-label={`Tile color for ${projectName}: ${CHOICE_LABELS[choice]}`}
      title={disabledReason ?? 'Tile color'}
      disabled={disabledReason !== null}
      aria-describedby={disabledReason !== null ? reasonId : undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      // While open, a press here must not move focus: the blur would close the popover and the
      // click would open it again.
      onMouseDown={(e) => {
        if (open) e.preventDefault()
      }}
      onClick={() => {
        if (open) {
          onOpenChange(false)
          buttonRef.current?.focus()
        } else {
          onOpenChange(true)
        }
      }}
    >
      <span className={`${COLOR_DOT} ${choice === 'none' ? NONE_DOT : SWATCH_BG[choice]}`} aria-hidden="true" />
    </button>
  )
}

interface TileColorPopoverProps {
  color: TileColor | undefined
  /** The Tile color button: a press on it is not a press outside, and focus returns to it. */
  buttonRef: RefObject<HTMLButtonElement | null>
  /** Applies a pick; false means it was refused and nothing changed. */
  onPick: (color: TileColor | null) => boolean
  onOpenChange: (open: boolean) => void
}

/** The popover: six native radios in one group, under a title, with a hint. Not a modal surface. */
export function TileColorPopover({ color, buttonRef, onPick, onOpenChange }: TileColorPopoverProps) {
  const baseId = useId()
  const titleId = `${baseId}-title`
  const rootRef = useRef<HTMLDivElement>(null)
  const choice = choiceOf(color)
  // Set by a press on a choice and cleared by any key: an arrow key's change comes with a click
  // too, and only a mouse or touch pick closes the popover.
  const pickByPointerRef = useRef(false)
  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  })

  useEffect(() => {
    rootRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
  }, [])

  useEffect(() => {
    // Capture phase: a press anywhere outside the popover and its button closes it, before the
    // press does whatever else it does.
    const closeOnOutsidePress = (e: PointerEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      onOpenChangeRef.current(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress, true)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress, true)
  }, [buttonRef])

  const close = (returnFocus: boolean) => {
    onOpenChange(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  const finishPointerPick = () => {
    if (!pickByPointerRef.current) return
    pickByPointerRef.current = false
    close(true)
  }

  const pick = (next: ColorChoice) => {
    if (onPick(next === 'none' ? null : next)) {
      finishPointerPick()
      return
    }
    // Refused: React puts the checked radio back, and focus goes back with it. The value is one
    // of the six fixed choices, never a project's name or id.
    rootRef.current?.querySelector<HTMLInputElement>(`input[value="${choice}"]`)?.focus()
  }

  return (
    <div
      ref={rootRef}
      className={POPOVER}
      role="dialog"
      aria-label="Tile color"
      onPointerDown={(e) => {
        pickByPointerRef.current = (e.target as Element).closest('label') !== null
      }}
      onMouseDown={(e) => {
        // A press on a label or the text must not take focus out of the popover, which would
        // close it before the click.
        if (!(e.target as Element).matches('input')) e.preventDefault()
      }}
      onKeyDown={(e) => {
        pickByPointerRef.current = false
        if (e.key !== 'Escape' && e.key !== 'Enter') return
        // ⚠️ stopPropagation is what keeps a waiting import (R-2): Story Map's import preview listens
        // for Escape on the document and does not check defaultPrevented. React's root here is
        // `#root`, below the document, so stopping it there keeps it from the preview.
        e.preventDefault()
        e.stopPropagation()
        close(true)
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null
        // No next element: the window lost focus, or a press outside, which closes it by itself.
        if (next && !e.currentTarget.contains(next)) onOpenChange(false)
      }}
    >
      <p className={POP_TITLE} id={titleId}>
        Tile color
      </p>
      <div className={SWATCHES} role="radiogroup" aria-labelledby={titleId}>
        {CHOICES.map((value) => {
          const radioId = `${baseId}-${value}`
          return (
            <label key={value} className={SW} htmlFor={radioId}>
              <input
                type="radio"
                className={SW_RADIO}
                id={radioId}
                name={`tile-color-${baseId}`}
                value={value}
                checked={choice === value}
                onChange={() => pick(value)}
                // Picking the colour already chosen changes nothing, but a mouse pick still closes.
                onClick={() => {
                  if (choice === value) finishPointerPick()
                }}
              />
              <span className={`${SW_DOT} ${value === 'none' ? SW_NONE : SWATCH_BG[value]}`} data-c={value} aria-hidden="true" />
              {CHOICE_LABELS[value]}
            </label>
          )
        })}
      </div>
      <p className={POP_HINT}>Arrow keys choose. Enter or Esc closes.</p>
    </div>
  )
}
