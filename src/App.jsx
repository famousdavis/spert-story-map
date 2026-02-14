import { Routes, Route, Navigate } from 'react-router-dom';
import ProductList from './pages/ProductList';
import ProductLayout from './components/layout/ProductLayout';
import StructureView from './pages/StructureView';
import ReleasePlanningView from './pages/ReleasePlanningView';
import ProgressTrackingView from './pages/ProgressTrackingView';
import InsightsView from './pages/InsightsView';
import SettingsView from './pages/SettingsView';
import StoryMapView from './pages/StoryMapView';
import ChangelogView from './pages/ChangelogView';
import AboutView from './pages/AboutView';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProductList />} />
      <Route path="/about" element={<AboutView />} />
      <Route path="/changelog" element={<ChangelogView />} />
      <Route path="/product/:productId" element={<ProductLayout />}>
        <Route index element={<Navigate to="structure" replace />} />
        <Route path="structure" element={<StructureView />} />
        <Route path="releases" element={<ReleasePlanningView />} />
        <Route path="storymap" element={<StoryMapView />} />
        <Route path="progress" element={<ProgressTrackingView />} />
        <Route path="insights" element={<InsightsView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}
