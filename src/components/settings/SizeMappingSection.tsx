// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Section } from '../ui/Section';
import ConfirmDialog from '../ui/ConfirmDialog';
import SizeMappingRow from './SizeMappingRow';
import type { SizeRowField } from './SizeMappingRow';
import {
  addBackProblem, addBackSizeToProduct, addSizeToProduct, effectiveSizeIndex, MAX_SIZES, orphanLabels, parseSizePoints,
  removeNeedsConfirm, removeSizeDecision, removeSizeFromProduct, renameSizeInProduct, setSizePointsInProduct,
  sizeLabelProblem, sizeRowPoints, sizeUsage,
} from '../../lib/settingsMutations';
import type { SizeUse } from '../../lib/settingsMutations';
import {
  addedBackLine, lockedPointsNote, MAX_SIZES_LINE, ORPHAN_HINT, ORPHAN_TITLE, orphanLine, POINTS_PROBLEM, quoted, removeConfirmMessage,
  removedLine, removeRefusal, revivalLines, staleLine, zeroPointsLine,
} from './sizeMappingText';
import type { Product, ProductUpdater, SizeMapping } from '../../types';

interface SizeMappingSectionProps {
  product: Product;
  updateProduct: (updater: ProductUpdater) => void;
}

/**
 * A line under a row. Keyed by the row's label plus its occurrence among rows with that
 * label, never by index, so it stays with its size when a row above goes and two legacy
 * rows with one label never share it. Bound to the list as it was just after the action
 * that made it (`sig`), so the next change it did not cause clears it and its own write
 * does not.
 */
interface Line { key: string; sig: string; reason?: { text: string; field: SizeRowField }; info?: string[] }

/**
 * The key of the one line that belongs to no row: "“L” was changed elsewhere." The row
 * now at that index holds some other size, so the line goes under the list instead.
 */
const SECTION_LINE = '\u0000section';

const rowKey = (rows: SizeMapping[], index: number) => {
  const label = rows[index]?.label;
  return `${label}\u0000${rows.slice(0, index).filter(r => r.label === label).length}`;
};
const signature = (rows: SizeMapping[]) => JSON.stringify(rows.map(r => [r.label, r.points]));

/**
 * What to do once the list is the one an action's write makes: focus, and what to say. It
 * runs only when the list is exactly that, and is dropped in the render after the action
 * whatever happened, so a write the updater refused leaves nothing for a later change to set
 * off.
 */
type FollowUp = { after: string; run: (rows: SizeMapping[]) => void };

export default function SizeMappingSection({ product, updateProduct }: SizeMappingSectionProps) {
  const rows = product.sizeMapping;
  const usage = useMemo(() => sizeUsage(product), [product]);
  const orphans = useMemo(() => orphanLabels(product), [product]);
  const [lines, setLines] = useState<Line[]>([]);
  const [addedBack, setAddedBack] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ index: number; label: string } | null>(null);
  const { announcement, announce, announceLater, silence } = useAnnouncer();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);
  const followUp = useRef<FollowUp | null>(null);
  // Bumped with every follow-up, so the render after the action checks it even when the
  // write changed nothing.
  const [actions, setActions] = useState(0);
  const sig = signature(rows);

  useEffect(() => {
    const next = followUp.current;
    followUp.current = null;
    if (next && signature(rows) === next.after) next.run(rows);
  }, [rows, actions]);

  const find = (selector: string) => rootRef.current?.querySelector<HTMLElement>(selector) ?? null;
  const once = (after: SizeMapping[], run: FollowUp['run']) => {
    followUp.current = { after: signature(after), run };
    setActions(n => n + 1);
  };

  // A line belongs to the list it was made for. Once the list is anything else the line
  // goes for good, so a list that later returns to that state does not bring it back. A
  // revival line is made for the list after its own write, which lands in the same render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(prev => (prev.every(l => l.sig === sig) ? prev : prev.filter(l => l.sig === sig)));
  }, [sig]);

  const putLine = (line: Omit<Line, 'sig'>, at = sig) =>
    setLines(prev => [...prev.filter(l => l.sig === sig && l.key !== line.key), { ...line, sig: at }]);
  const refuse = (index: number, field: SizeRowField, text: string) => {
    announce(text);
    if (rows[index]) putLine({ key: rowKey(rows, index), reason: { text, field } });
  };
  /** The row this action started on no longer holds `label`: said once, under the list. */
  const refuseStale = (label: string) => {
    announce(staleLine(label));
    putLine({ key: SECTION_LINE, info: [staleLine(label)] });
  };

  const rename = (index: number, expected: string, text: string): boolean => {
    const row = rows[index];
    const label = text.trim();
    if (row?.label === label) return false;
    if (!row || row.label !== expected) { refuseStale(expected); return false; }
    const problem = sizeLabelProblem(rows, index, label);
    if (problem) { refuse(index, 'label', problem); return false; }
    const revived = usage.get(label);
    if (revived) {
      const after = renameSizeInProduct(product, index, expected, label).sizeMapping;
      const info = revivalLines(label, revived.items, revived.locked, sizeRowPoints(row));
      announce(info.join(' '));
      putLine({ key: rowKey(after, index), info }, signature(after));
    } else silence();
    updateProduct(prev => renameSizeInProduct(prev, index, expected, label));
    return true;
  };

  const setPoints = (index: number, expected: string, text: string): boolean => {
    const row = rows[index];
    const points = parseSizePoints(text);
    if (row && points !== null && points === Number(row.points)) return false;
    if (!row || row.label !== expected) { refuseStale(expected); return false; }
    if (points === null) { refuse(index, 'points', POINTS_PROBLEM); return false; }
    silence();
    updateProduct(prev => setSizePointsInProduct(prev, index, expected, points));
    return true;
  };

  // Once the row is gone: say so, and focus the next row's Remove, else the previous
  // row's, else "+ Add Size".
  const commitRemove = (index: number, label: string, confirmed: boolean) => {
    silence();
    once(rows.filter((_, i) => i !== index), now => {
      announceLater(removedLine(label));
      const at = Math.min(index, now.length - 1);
      (at >= 0 ? find(`[data-size-remove="${at}"]`) : addRef.current)?.focus();
    });
    updateProduct(prev => removeSizeFromProduct(prev, index, label, confirmed));
  };
  // The click and the confirm decide the same way, against the list as it is now.
  const remove = (index: number, label: string, confirmed: boolean) => {
    const decision = removeSizeDecision(product, index, label);
    const refusal = removeRefusal(label, decision);
    if (decision.kind === 'stale') refuseStale(label);
    else if (refusal) refuse(index, 'remove', refusal);
    else if (removeNeedsConfirm(decision) && !confirmed) setDialog({ index, label });
    else commitRemove(index, label, confirmed);
  };

  const addBack = (label: string, items: number) => {
    silence();
    setAddedBack(prev => [...prev, label]);
    // Once the row is in: its points, and what it brought back is said.
    once([...rows, { label, points: 0 }], now => {
      find(`[data-size-points="${now.length - 1}"]`)?.focus();
      announceLater(addedBackLine(label, items));
    });
    updateProduct(prev => addBackSizeToProduct(prev, label));
  };

  const addSize = () => {
    silence();
    // The new row's label, so focus is not left on a button that has just disabled itself
    // (the 20th row).
    once(addSizeToProduct(product).sizeMapping, now => find(`[data-size-label="${now.length - 1}"]`)?.focus());
    updateProduct(addSizeToProduct);
  };

  const shown = lines.filter(l => l.sig === sig);
  const stale = shown.find(l => l.key === SECTION_LINE)?.info ?? [];
  const dialogDecision = dialog ? removeSizeDecision(product, dialog.index, dialog.label) : null;
  // An open confirm whose remove no longer needs one (its items moved, or the next row now
  // has the same points) closes, rather than showing an empty message. A refusal stays in
  // it until Remove or Cancel, so the person sees why.
  const dialogMoot = dialog !== null && dialogDecision !== null && !removeNeedsConfirm(dialogDecision)
    && removeRefusal(dialog.label, dialogDecision) === null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (dialogMoot) setDialog(null);
  }, [dialogMoot]);

  return (
    <Section title="T-Shirt Size Mapping">
      <div ref={rootRef} className="space-y-2">
        {rows.map((m, i) => {
          const mine = shown.filter(l => l.key === rowKey(rows, i));
          return (
            <SizeMappingRow
              key={i}
              row={m}
              index={i}
              reason={[...mine].reverse().find(l => l.reason)?.reason ?? null}
              info={mine.flatMap(l => l.info ?? [])}
              zero={zeroLine(rows, i, usage, addedBack)}
              note={lockNote(rows, i, usage)}
              onRename={rename}
              onPoints={setPoints}
              onRemove={(index, label) => remove(index, label, false)}
            />
          );
        })}
        {stale.map(text => <p key={text} className="text-xs text-red-600 dark:text-red-400">{text}</p>)}
        <button
          ref={addRef}
          onClick={addSize}
          disabled={rows.length >= MAX_SIZES}
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-2 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          + Add Size
        </button>
        {rows.length >= MAX_SIZES && <p className="text-xs text-gray-500 dark:text-gray-400">{MAX_SIZES_LINE}</p>}
        <OrphanSizes rows={rows} orphans={orphans} onAddBack={addBack} />
        <p aria-live="polite" className="sr-only">{announcement}</p>
      </div>
      <ConfirmDialog
        open={dialog !== null && !dialogMoot}
        onClose={() => setDialog(null)}
        onConfirm={() => { if (dialog) remove(dialog.index, dialog.label, true); }}
        title={dialog ? `Remove ${quoted(dialog.label)}?` : ''}
        message={dialog && dialogDecision
          ? removeConfirmMessage(dialog.label, dialogDecision) ?? removeRefusal(dialog.label, dialogDecision) ?? ''
          : ''}
        confirmLabel="Remove"
        danger
      />
    </Section>
  );
}

/**
 * The section's polite live region. It speaks only when its text changes, so the same
 * refusal twice would be heard once. As on the Products page (CLAUDE.md #75): empty it in
 * its own render, then set the text a tick later.
 */
function useAnnouncer() {
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  /** From a handler. Called before any write in that handler, so the flush carries only the emptying. */
  const announce = useCallback((text: string) => {
    stop();
    flushSync(() => setAnnouncement(''));
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setAnnouncement(text);
    }, 0);
  }, [stop]);
  /** From an effect, where flushSync cannot flush while React commits: a tick later. */
  const announceLater = useCallback((text: string) => {
    stop();
    timer.current = window.setTimeout(() => announce(text), 0);
  }, [stop, announce]);
  /** A save went through: the last refusal does not stay in the region. */
  const silence = useCallback(() => {
    stop();
    setAnnouncement('');
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { announcement, announce, announceLater, silence };
}

/** R37's note, under the effective row for a label that locked items use. */
function lockNote(rows: SizeMapping[], index: number, usage: Map<string, SizeUse>): string | null {
  const row = rows[index];
  const locked = row?.label ? usage.get(row.label)?.locked ?? 0 : 0;
  if (!row || locked === 0 || effectiveSizeIndex(rows, row.label) !== index) return null;
  return lockedPointsNote(row.label, locked);
}

/** Derived, not stored: a row added back during this visit, still at 0 points, that items use. */
function zeroLine(rows: SizeMapping[], index: number, usage: Map<string, SizeUse>, addedBack: string[]): string | null {
  const row = rows[index];
  const items = row?.label ? usage.get(row.label)?.items ?? 0 : 0;
  if (!row || items === 0 || !addedBack.includes(row.label) || sizeRowPoints(row) !== 0) return null;
  return effectiveSizeIndex(rows, row.label) === index ? zeroPointsLine(row.label, items) : null;
}

function OrphanSizes({ rows, orphans, onAddBack }: {
  rows: SizeMapping[];
  orphans: { label: string; items: number }[];
  onAddBack: (label: string, items: number) => void;
}) {
  if (orphans.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ORPHAN_TITLE}</p>
      <ul className="mt-1 space-y-1">
        {orphans.map(o => {
          const problem = addBackProblem(rows, o.label, o.items);
          return (
            <li key={o.label} className="flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <span>{orphanLine(o.label, o.items)}</span>
              {problem
                ? <span className="text-xs text-amber-800 dark:text-amber-300">{problem}</span>
                : (
                  <button
                    onClick={() => onAddBack(o.label, o.items)}
                    aria-label={`Add back ${quoted(o.label)}`}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    Add back
                  </button>
                )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{ORPHAN_HINT}</p>
    </div>
  );
}
