// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// One dialog for New Project and Edit Project (v0.55.0). It replaces CreateProjectModal and the
// tile's rename in place. The look is SPERT Forecaster's project dialog; Ctrl+S / Cmd+S is
// GanttApp's (`src/features/projects/ProjectDialog.tsx:162-167` at aa43ae7).

import { useId, useRef, useState } from 'react';
import DialogShell from './DialogShell';
import { PROJECT_NAME_MAX } from '../../lib/cloneName';
import {
  DIALOG, DIALOG_BG, DIALOG_BUTTONS, DIALOG_CANCEL, DIALOG_SUBMIT, DIALOG_TITLE, FIELD, HINT,
  INPUT_BASE, INPUT_BORDER, LABEL,
} from './dashboard-styles';

/** What Update writes: only the fields the person changed, each trimmed. */
export interface ProjectEdits {
  name?: string;
  description?: string;
}

interface ProjectDialogProps {
  /** null for New Project; otherwise the project being edited, as the list shows it. */
  project: { name: string; description?: string } | null;
  onCancel: () => void;
  onCreate: (name: string, description: string) => void;
  /** Called with the changed fields only; never called when nothing changed. */
  onUpdate: (edits: ProjectEdits) => void;
  /** Update closed the dialog with nothing to write. */
  onUnchanged: () => void;
  returnFocusTo: () => HTMLElement | null;
}

export default function ProjectDialog({ project, onCancel, onCreate, onUpdate, onUnchanged, returnFocusTo }: ProjectDialogProps) {
  const baseId = useId();
  // What the fields showed when the dialog opened. A field is changed when its trimmed text
  // differs from its prefill's: an untouched field is neither written nor trimmed, so a
  // description written meanwhile elsewhere survives a rename.
  const [prefill] = useState(() => ({ name: project?.name ?? '', description: project?.description ?? '' }));
  const [name, setName] = useState(prefill.name);
  const [description, setDescription] = useState(prefill.description);
  const isEdit = project !== null;
  // Set by the first save. New Project stays open until its create has finished (a server round
  // trip in the cloud), so without it a second Create, Enter or Ctrl/Cmd+S made a second project.
  // A ref as well as state: two presses in one task both read the ref, not a stale render.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const canSave = name.trim().length > 0 && !saving;

  const save = () => {
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    if (!isEdit) {
      onCreate(name.trim(), description.trim());
      return;
    }
    const edits: ProjectEdits = {};
    if (name.trim() !== prefill.name.trim()) edits.name = name.trim();
    if (description.trim() !== prefill.description.trim()) edits.description = description.trim();
    if (Object.keys(edits).length === 0) onUnchanged();
    else onUpdate(edits);
  };

  return (
    <DialogShell
      role="dialog"
      title={isEdit ? 'Edit Project' : 'New Project'}
      titleClassName={DIALOG_TITLE}
      className={`${DIALOG} ${DIALOG_BG}`}
      initialFocus={root => root.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button:not([disabled])')}
      selectInitial={isEdit}
      onEscape={onCancel}
      onSave={save}
      returnFocusTo={returnFocusTo}
    >
      <div className={FIELD}>
        <label htmlFor={`${baseId}-name`} className={LABEL}>Project Name</label>
        <input
          id={`${baseId}-name`}
          name="projectName"
          type="text"
          autoComplete="off"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            save();
          }}
          maxLength={PROJECT_NAME_MAX}
          placeholder="e.g., Billing System v2"
          className={`${INPUT_BASE} ${INPUT_BORDER}`}
        />
      </div>
      <div className={FIELD}>
        <label htmlFor={`${baseId}-desc`} className={LABEL}>Description (Optional)</label>
        <textarea
          id={`${baseId}-desc`}
          name="projectDescription"
          autoComplete="off"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          placeholder="Brief description of the project"
          className={`${INPUT_BASE} ${INPUT_BORDER} resize-y`}
        />
      </div>
      <div className={DIALOG_BUTTONS}>
        <button type="button" onClick={onCancel} className={DIALOG_CANCEL}>Cancel</button>
        <button type="button" onClick={save} disabled={!canSave} className={DIALOG_SUBMIT}>
          {isEdit ? 'Update' : 'Create'}
        </button>
      </div>
      <p className={HINT}>Enter in Project Name, or Ctrl+S (Cmd+S), saves. Esc cancels.</p>
    </DialogShell>
  );
}
