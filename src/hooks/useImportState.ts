// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type RefObject,
  type ChangeEvent,
} from 'react';
import { flushSync } from 'react-dom';
import type {
  StorageDriver,
  StorageMode,
  ImportPhase,
  ConflictAction,
  ImportOutcome,
} from '../types';
import {
  parseImportFile,
  detectConflicts,
  buildDefaultDecisions,
  applyImport,
} from '../lib/import-utils';

function readFileAsText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error('Could not read file. Please try again.'));
    try {
      reader.readAsText(file);
    } catch (err) {
      reject(err);
    }
  });
}

export interface UseImportStateReturn {
  phase: ImportPhase;
  // React 19: useRef<T>(null) returns RefObject<T | null>, not RefObject<T>.
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  setDecision: (importedProductId: string, action: ConflictAction) => void;
  handleConfirmImport: () => Promise<void>;
  handleCancel: () => void;
}

/**
 * State machine for the Level 4 multi-project import flow (ProductList surface).
 *
 * @param driver          Active StorageDriver, or null if not yet ready.
 * @param mode            Effective storage mode from useStorage().
 * @param cloudDataLoaded True once the first successful loadProductIndex() has
 *                        completed in cloud mode. Gates import to prevent false
 *                        "no conflicts" results during Firestore hydration.
 * @param onRefresh       Reloads the ProductList after apply.
 */
export function useImportState(
  driver: StorageDriver | null,
  mode: StorageMode,
  cloudDataLoaded: boolean,
  onRefresh: () => Promise<void>,
): UseImportStateReturn {
  const [phase, setPhase] = useState<ImportPhase>({ tag: 'idle' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const applyActiveRef = useRef(false);
  const readerPendingRef = useRef(false);
  // Monotonically increasing counter — used as `key` on ImportPreviewBody.
  // Guarantees remount (and heading re-focus) even when the same filename
  // is picked twice in succession.
  const pickSeqRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    // Block during file-read or during an in-flight applyImport. Without the
    // applyActiveRef check, a user could pick a new file while writes are in
    // progress, replacing 'applying' phase with 'preview' mid-write.
    if (readerPendingRef.current) return;
    if (applyActiveRef.current) return;

    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    // Cloud readiness gate — defense-in-depth inside the hook so future callers
    // that omit the button-disabled guard cannot bypass it.
    if (mode === 'cloud' && !cloudDataLoaded) {
      setPhase({ tag: 'error', message: 'Cloud projects are still loading. Please wait a moment and try again.' });
      return;
    }

    setPhase(prev =>
      prev.tag === 'error' || prev.tag === 'done' ? { tag: 'idle' } : prev,
    );

    readerPendingRef.current = true;

    void (async () => {
      try {
        const text = await readFileAsText(file);
        if (!isMountedRef.current) return;

        const parsed = parseImportFile(text);
        if (!parsed.ok) {
          if (isMountedRef.current) setPhase({ tag: 'error', message: parsed.error });
          return;
        }

        if (!driver) {
          if (isMountedRef.current) setPhase({ tag: 'error', message: 'Storage not ready. Please try again.' });
          return;
        }

        const existing = await driver.loadProductIndex();
        if (!isMountedRef.current) return;

        const conflicts = detectConflicts(parsed.products, existing);
        const decisions = buildDefaultDecisions(conflicts);

        // Extracted local to keep the side-effect out of the setPhase argument literal.
        const seq = ++pickSeqRef.current;
        setPhase({
          tag: 'preview',
          parsed: { products: parsed.products, fileName: file.name },
          conflicts,
          decisions,
          pickSeq: seq,
        });
      } catch (err) {
        if (isMountedRef.current) {
          setPhase({ tag: 'error', message: `Failed to read file: ${(err as Error).message}` });
        }
      } finally {
        readerPendingRef.current = false;
      }
    })();
  }, [driver, mode, cloudDataLoaded]);

  const setDecision = useCallback((importedProductId: string, action: ConflictAction) => {
    setPhase(prev => {
      if (prev.tag !== 'preview') return prev;
      return {
        ...prev,
        decisions: prev.decisions.map(d =>
          d.importedProductId === importedProductId ? { ...d, action } : d,
        ),
      };
    });
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (phase.tag !== 'preview') return;
    if (!driver) return;
    if (applyActiveRef.current) return;

    const currentParsed = phase.parsed;
    const currentDecisions = phase.decisions;

    try {
      applyActiveRef.current = true;

      flushSync(() => setPhase({ tag: 'applying' }));
      await new Promise<void>(r => requestAnimationFrame(() => r()));

      let outcome: ImportOutcome | undefined;
      try {
        outcome = await applyImport(driver, currentParsed, currentDecisions);
      } catch (writeErr) {
        if (isMountedRef.current) {
          setPhase({ tag: 'error', message: `Import failed: ${(writeErr as Error).message}` });
        }
        return;
      }

      try {
        await onRefresh();
      } catch {
        console.warn('useImportState: onRefresh failed after successful import; project list may need a manual refresh.');
      }

      if (isMountedRef.current) setPhase({ tag: 'done', outcome });
    } finally {
      applyActiveRef.current = false;
    }
  }, [phase, driver, onRefresh]);

  const handleCancel = useCallback(() => {
    if (applyActiveRef.current) return;
    if (phase.tag === 'applying') return;
    setPhase({ tag: 'idle' });
  }, [phase.tag]);

  return { phase, fileInputRef, handleFileChange, setDecision, handleConfirmImport, handleCancel };
}
