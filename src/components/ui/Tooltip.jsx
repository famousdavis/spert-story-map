import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hook that provides tooltip binding and a portal element.
 *
 * Usage:
 *   const { triggerRef, onMouseEnter, onMouseLeave, tooltipEl } = useTooltip(text);
 *   return <><div ref={triggerRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>…</div>{tooltipEl}</>
 */
export function useTooltip(text, delay = 200) {
  const [visible, setVisible] = useState(false);
  const posRef = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef(null);
  const triggerRef = useRef(null);

  const onMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      const el = triggerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const newPos = { x: rect.left + rect.width / 2, y: rect.top };
        posRef.current = newPos;
        setPos(newPos);
      }
      setVisible(true);
    }, delay);
  }, [delay]);

  const onMouseLeave = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const tooltipEl = visible && text
    ? createPortal(
        <div
          className="fixed z-[9999] pointer-events-none px-2 py-1 text-xs text-white bg-gray-800 rounded shadow-lg max-w-xs break-words whitespace-pre-wrap"
          style={{
            left: pos.x,
            top: pos.y - 4,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {text}
        </div>,
        document.body
      )
    : null;

  return { triggerRef, onMouseEnter, onMouseLeave, tooltipEl };
}
