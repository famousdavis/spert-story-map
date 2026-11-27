// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link, useParams, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useProduct } from '../../hooks/useProduct';
import { useStorage } from '../../lib/StorageProvider';
import { formatRelativeTime } from '../../lib/formatDate';
import { framePlace } from '../../lib/framePlace';
import CloudLoadNotice from '../ui/CloudLoadNotice';
import ErrorBoundary from '../ui/ErrorBoundary';
import HeadingRow from './HeadingRow';
import { useAiConnectivity } from '../../hooks/useAiConnectivity';
import { isFirebaseAvailable } from '../../lib/firebase';
import { AI_CONSENT_KEY, AI_CONSENT_VERSION } from '../../lib/aiConstants';
import { anySessionRecorded } from '../../lib/aiSessionRecords';
import ConsentModal from '../ConnectAI/ConsentModal';
import ConnectPanel from '../ConnectAI/ConnectPanel';

/** On the Map and Sizing `main` runs full bleed (X2): the heading row and the notices go in the shared column there. */
function ProductColumn({ canvas, children }: { canvas: boolean; children: ReactNode }) {
  return canvas ? <div className="sf-col">{children}</div> : <>{children}</>;
}

export default function ProductLayout() {
  const { productId } = useParams();
  const { product, loading, lastSaved, updateProduct, undo, redo } = useProduct(productId);
  const { driver, mode } = useStorage();
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState(false);
  const location = useLocation();
  const isCanvasView = framePlace(location.pathname).canvas;

  // Called before the null-check early returns below so the Rules of Hooks
  // hold (product may be null during initial load).
  const { sessionState, startSession, stopSession, changePermissions, dismissNotice } =
    useAiConnectivity(product, updateProduct);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Active session → open the panel. Otherwise: if consent is current and a
  // session is recorded (B15: for any product, or from before v0.55.11), start
  // silently and open the panel; a first-time user gets the consent modal.
  const handleConnectAiClick = useCallback(() => {
    if (sessionState.sessionActive) { setShowAiPanel(true); return; }
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem(AI_CONSENT_KEY) ?? 'null') as { version?: number; read?: boolean } | null; }
      catch { return null; }
    })();
    if (stored?.version === AI_CONSENT_VERSION && anySessionRecorded()) {
      startSession((stored.read as boolean) ?? false)
        .then(ok => { if (ok) setShowAiPanel(true); })
        .catch(console.error);
    } else {
      setShowAiConsent(true);
    }
  }, [sessionState.sessionActive, startSession]);

  // Consent modal "Connect": start the session, then swap to the panel.
  const handleConsentConnect = useCallback(async (consentRead: boolean) => {
    const ok = await startSession(consentRead);
    if (ok) { setShowAiConsent(false); setShowAiPanel(true); }
    return ok;
  }, [startSession]);

  useEffect(() => {
    if (!driver) return;
    // Capture the unsubscribe handle returned by the Set-backed subscriber
    // API. Previous code called onSaveError(null) on cleanup, which only
    // worked while the subscriber slot was a single-value field — under the
    // multi-subscriber Set it would silently no-op and leak a setState
    // target that fires after this component unmounts.
    const unsub = driver.onSaveError(() => setSaveError(true));
    return unsub;
  }, [driver]);

  // Safety net: if we end up in local mode with no loaded product
  // (e.g. because the driver swapped after a mode switch or sign-out
  // and the cloud-only product is no longer reachable), go home
  // instead of showing "Product not found".
  useEffect(() => {
    if (!loading && !product && mode === 'local') {
      navigate('/', { replace: true });
    }
  }, [loading, product, mode, navigate]);

  // Inside the frame (FRAME26, v0.57.0): the navigation row already shows this product's tabs, read from the route,
  // so while the product loads, or cannot be found, only the body says so. On the Map and Sizing `main` runs full
  // bleed (X2), so the heading row and the product's notices sit in the shared column there.
  if (loading) {
    return (
      <ProductColumn canvas={isCanvasView}>
        <HeadingRow>Product</HeadingRow>
        <p className="sf-below text-sm text-gray-600 dark:text-gray-300">Loading...</p>
      </ProductColumn>
    );
  }

  if (!product) {
    return (
      <ProductColumn canvas={isCanvasView}>
        <HeadingRow>Product</HeadingRow>
        <div className="sf-below">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Product not found</p>
          <Link to="/" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium">Back to Products</Link>
        </div>
      </ProductColumn>
    );
  }

  // The product's own heading row (contract §7): its name is the page's h1, one line, cut with an ellipsis, the full
  // name in `title`. Saved is status text just left of the toolbar, outside it, at its own 12 px (D10), in the frame's
  // muted colour (4.84 : 1 on #ffffff, 6.82 on #101828). Connect AI is the toolbar's one button, 36 px (`.sf-btn`).
  // Inactive, it is the theme button's rule (v0.58.0): the frame's muted text, the text colour on hover (4.84 / 6.82,
  // 12.63 / 14.40); it was gray-400 / gray-500, 2.60 / 3.67. Active, unchanged.
  const saved = lastSaved ? (
    <span className="flex-none text-xs whitespace-nowrap text-[color:var(--sf-text-muted)]">
      Saved {formatRelativeTime(lastSaved)}
    </span>
  ) : null;
  const connectAi = isFirebaseAvailable ? (
    <button type="button" onClick={handleConnectAiClick}
      title={sessionState.sessionActive ? 'AI session active' : 'Connect an AI assistant'}
      className={`sf-btn px-2.5 rounded-md transition-colors ${
        sessionState.sessionActive
          ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
          : 'text-[color:var(--sf-text-muted)] hover:text-[color:var(--sf-text)]'
      }`}
    >
      {sessionState.sessionActive && (
        <span className={`w-1.5 h-1.5 rounded-full ${
          sessionState.aiConnected ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
        }`} />
      )}
      {sessionState.sessionActive ? 'AI' : 'Connect AI'}
    </button>
  ) : null;

  return (
    <>
      <ProductColumn canvas={isCanvasView}>
        <HeadingRow title={product.name} status={saved} toolbar={connectAi}>{product.name}</HeadingRow>

        {/* The product's own notices, below its heading row: they belong to this product on every tab, not to the
            app, so they are not in the frame's notices slot. The save error's words are mode-aware: cloud failures
            are usually a network issue, not quota exhaustion. */}
        {saveError && (
          <div className="sf-notice sf-notice--error sf-below">
            <p>
              {mode === 'cloud'
                ? 'Changes may not have saved. Check your connection.'
                : 'Your browser may be out of storage or in private mode. Latest changes may not have been saved.'}
            </p>
          </div>
        )}

        <CloudLoadNotice productId={product.id} productName={product.name} />
      </ProductColumn>

      {/* The view, with its own boundary, so a view that cannot render leaves the frame, the tabs and the way back to
          the product list in place. The app-level boundary's Reload re-renders the same data, which is no way out at
          all. Cleared on navigation. */}
      <div className="sf-below">
        <ErrorBoundary inline resetKey={location.pathname}>
          <Outlet context={{ product, updateProduct, undo, redo }} />
        </ErrorBoundary>
      </div>

      <ConsentModal
        open={showAiConsent}
        onClose={() => setShowAiConsent(false)}
        onConnect={handleConsentConnect}
      />
      {/* B15 R-5: only while the session belongs to this product. After a history
          jump the first render on another product still holds the old session. */}
      <ConnectPanel
        open={showAiPanel && sessionState.boundProductId === product.id}
        onClose={() => { setShowAiPanel(false); dismissNotice(); }}
        sessionState={sessionState}
        onChangePermissions={changePermissions}
        onDisconnect={stopSession}
      />
    </>
  );
}
