import { Section } from '../ui/Section';

export default function SizeMappingSection({ sizeMapping, updateProduct }) {
  const updateSizeMapping = (index, field, value) => {
    updateProduct(prev => ({
      ...prev,
      sizeMapping: prev.sizeMapping.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      ),
    }));
  };

  const commitSizePoints = (index) => {
    updateProduct(prev => ({
      ...prev,
      sizeMapping: prev.sizeMapping.map((m, i) =>
        i === index ? { ...m, points: parseInt(m.points, 10) || 0 } : m
      ),
    }));
  };

  const addSize = () => {
    updateProduct(prev => ({
      ...prev,
      sizeMapping: [...prev.sizeMapping, { label: 'New', points: 0 }],
    }));
  };

  const removeSize = (index) => {
    updateProduct(prev => ({
      ...prev,
      sizeMapping: prev.sizeMapping.filter((_, i) => i !== index),
    }));
  };

  return (
    <Section title="T-Shirt Size Mapping">
      <div className="space-y-2">
        {sizeMapping.map((m, i) => (
          <div key={i} className="flex items-center gap-3">
            <input
              type="text"
              value={m.label}
              onChange={e => updateSizeMapping(i, 'label', e.target.value)}
              className="w-24 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1.5 text-sm text-center"
              placeholder="Label"
            />
            <input
              type="number"
              value={m.points}
              onChange={e => updateSizeMapping(i, 'points', e.target.value)}
              onBlur={() => commitSizePoints(i)}
              className="w-24 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1.5 text-sm text-center"
              placeholder="Points"
            />
            <span className="text-xs text-gray-400 dark:text-gray-500">pts</span>
            <button onClick={() => removeSize(i)} className="text-red-400 hover:text-red-600 dark:text-red-400/70 dark:hover:text-red-400 text-sm ml-auto">Remove</button>
          </div>
        ))}
        <button onClick={addSize} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-2">+ Add Size</button>
      </div>
    </Section>
  );
}
