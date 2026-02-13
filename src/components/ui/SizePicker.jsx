import { useState, useRef, useEffect } from 'react';

const SIZE_COLORS = {
  'XS': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'S': 'bg-teal-100 text-teal-800 border-teal-300',
  'M': 'bg-blue-100 text-blue-800 border-blue-300',
  'L': 'bg-amber-100 text-amber-800 border-amber-300',
  'XL': 'bg-orange-100 text-orange-800 border-orange-300',
  'XXL': 'bg-red-100 text-red-800 border-red-300',
  'XXXL': 'bg-rose-100 text-rose-800 border-rose-300',
};

export default function SizePicker({ value, sizeMapping, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const colorClass = value ? (SIZE_COLORS[value] || 'bg-gray-100 text-gray-800 border-gray-300') : '';

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`text-xs font-medium px-2 py-0.5 rounded border transition-colors ${
          value
            ? colorClass
            : 'bg-yellow-50 text-yellow-700 border-yellow-300 border-dashed'
        }`}
      >
        {value || 'Size?'}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[100px]">
          {sizeMapping.map(m => (
            <button
              key={m.label}
              onClick={() => { onChange(m.label); setOpen(false); }}
              className={`block w-full text-left px-3 py-1 text-sm hover:bg-gray-50 transition-colors ${
                value === m.label ? 'font-semibold bg-gray-50' : ''
              }`}
            >
              <span className={`inline-block w-10 text-xs font-medium px-1.5 py-0.5 rounded ${SIZE_COLORS[m.label] || 'bg-gray-100'}`}>
                {m.label}
              </span>
              <span className="ml-2 text-gray-500 text-xs">{m.points} pts</span>
            </button>
          ))}
          {value && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { onChange(null); setOpen(false); }}
                className="block w-full text-left px-3 py-1 text-sm text-gray-400 hover:bg-gray-50"
              >
                Clear size
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { SIZE_COLORS };
