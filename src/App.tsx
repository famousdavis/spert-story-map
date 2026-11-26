// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ui/ErrorBoundary';
import AppShell from './components/layout/AppShell';
import ProductList from './pages/ProductList';
import ProductLayout from './components/layout/ProductLayout';
import StructureView from './pages/StructureView';
import ReleasePlanningView from './pages/ReleasePlanningView';
import ProgressTrackingView from './pages/ProgressTrackingView';
import InsightsView from './pages/InsightsView';
import SettingsView from './pages/SettingsView';
import StoryMapView from './pages/StoryMapView';
import SizingView from './pages/SizingView';
import ChangelogView from './pages/ChangelogView';
import AboutView from './pages/AboutView';
import NotFoundView from './pages/NotFoundView';

// Every route sits in the SPERT® Suite app frame (FRAME26, v0.57.0): AppShell is one layout route, mounted once,
// which also holds the app-wide notices that this file mounted outside <Routes> before.
export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<ProductList />} />
        <Route path="/about" element={<AboutView />} />
        <Route path="/changelog" element={<ChangelogView />} />
        <Route path="/product/:productId" element={<ProductLayout />}>
          <Route index element={<Navigate to="structure" replace />} />
          <Route path="structure" element={<StructureView />} />
          <Route path="releases" element={<ReleasePlanningView />} />
          <Route path="storymap" element={<StoryMapView />} />
          <Route path="sizing" element={<SizingView />} />
          <Route path="progress" element={<ProgressTrackingView />} />
          <Route path="insights" element={<InsightsView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
        <Route path="*" element={<NotFoundView />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}
