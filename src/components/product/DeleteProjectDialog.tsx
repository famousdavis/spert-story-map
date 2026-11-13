// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// The Projects page's Delete confirmation (v0.55.0): GanttApp's look (`ConfirmDialog.tsx`'s modal
// variant at aa43ae7), Forecaster's `alertdialog`, in the page's own dialog shell. Focus opens on
// Cancel, so Enter never deletes by default. A press and release on the backdrop is Cancel.

import { useId } from 'react';
import DialogShell from './DialogShell';
import {
  CONFIRM_BUTTONS, CONFIRM_CANCEL, CONFIRM_DELETE, CONFIRM_DIALOG, CONFIRM_MESSAGE, DIALOG_BG, DIALOG_TITLE,
} from './dashboard-styles';

interface DeleteProjectDialogProps {
  projectName: string;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusTo: () => HTMLElement | null;
}

export default function DeleteProjectDialog({ projectName, onCancel, onConfirm, returnFocusTo }: DeleteProjectDialogProps) {
  const messageId = useId();
  return (
    <DialogShell
      role="alertdialog"
      title="Delete Project"
      titleClassName={DIALOG_TITLE}
      className={`${CONFIRM_DIALOG} ${DIALOG_BG}`}
      describedBy={messageId}
      initialFocus={root => root.querySelector<HTMLElement>('[data-confirm-cancel]')}
      onEscape={onCancel}
      onBackdrop={onCancel}
      returnFocusTo={returnFocusTo}
    >
      <div id={messageId} className={CONFIRM_MESSAGE}>
        {`Are you sure you want to delete "${projectName}"? This cannot be undone. Consider exporting first.`}
      </div>
      <div className={CONFIRM_BUTTONS}>
        <button type="button" data-confirm-cancel onClick={onCancel} className={CONFIRM_CANCEL}>Cancel</button>
        <button type="button" onClick={onConfirm} className={CONFIRM_DELETE}>Delete</button>
      </div>
    </DialogShell>
  );
}
