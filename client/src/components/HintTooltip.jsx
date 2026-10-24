import React, { useId } from 'react';

const POSITION = {
  bottom: 'top-full mt-1.5 left-1/2 -translate-x-1/2',
  top: 'bottom-full mb-1.5 left-1/2 -translate-x-1/2',
  left: 'right-full mr-1.5 top-1/2 -translate-y-1/2',
  right: 'left-full ml-1.5 top-1/2 -translate-y-1/2',
};

/**
 * A short explanation for a control whose purpose is not obvious from its face (icon-only buttons,
 * "View" links). Shown on mouse hover AND on keyboard focus, and announced to screen readers through
 * aria-describedby on the wrapped control. Wraps exactly one interactive element.
 */
export default function HintTooltip({ text, children, placement = 'bottom', className = '' }) {
  const id = useId();
  if (!text) return children;
  const child = React.Children.only(children);
  return (
    <span className={`relative inline-flex group ${className}`}>
      {React.cloneElement(child, { 'aria-describedby': [child.props['aria-describedby'], id].filter(Boolean).join(' ') })}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded bg-[#1e1b4b] px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-white shadow-md opacity-0 invisible transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${POSITION[placement] || POSITION.bottom}`}
      >
        {text}
      </span>
    </span>
  );
}
