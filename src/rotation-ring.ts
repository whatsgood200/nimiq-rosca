const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_VISUAL_DOTS = 16;
const CENTER = 100;
const RADIUS = 76;

export interface RingOptions {
  /** Whose turn it is (this round's recipient). Defaults to 0. */
  activeIndex?: number;
  /** Per-index paid-this-round state, same length as memberCount. Omit for a static preview. */
  paidIndexes?: boolean[];
  /** Overrides the member-count number in the center. */
  centerLabel?: string;
  /** Overrides "MEMBER"/"MEMBERS" under the center label. */
  subLabel?: string;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Draws a ring of N notches — one per member. Whose turn it is shows as a
 * brass stroke (persists all round, independent of that member's own paid
 * status); whether each member has paid this round shows as a solid vs
 * hollow fill. On the create screen (no paidIndexes given) it's a static
 * preview of the rotation; on the ledger screen it's a live progress read.
 */
export function renderRing(svg: SVGSVGElement, memberCount: number, options: RingOptions = {}): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const dotCount = Math.max(1, Math.min(memberCount || 0, MAX_VISUAL_DOTS));
  const reduceMotion = prefersReducedMotion();
  const activeIndex = options.activeIndex ?? 0;

  for (let i = 0; i < dotCount; i += 1) {
    const angle = (i / dotCount) * 2 * Math.PI - Math.PI / 2;
    const cx = CENTER + RADIUS * Math.cos(angle);
    const cy = CENTER + RADIUS * Math.sin(angle);
    const isActive = i === activeIndex;
    const isPaid = options.paidIndexes?.[i] === true;

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', isActive ? '9' : '6');
    let className = 'ring-dot';
    if (isActive) className += ' ring-dot--active';
    if (isPaid) className += ' ring-dot--paid';
    dot.setAttribute('class', className);
    if (!reduceMotion) {
      dot.style.animationDelay = `${i * 45}ms`;
    } else {
      dot.style.animation = 'none';
    }
    svg.appendChild(dot);
  }

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', String(CENTER));
  label.setAttribute('y', String(CENTER - 6));
  label.setAttribute('class', 'ring-count');
  label.textContent = options.centerLabel ?? (memberCount > 0 ? String(memberCount) : '—');
  svg.appendChild(label);

  const sub = document.createElementNS(SVG_NS, 'text');
  sub.setAttribute('x', String(CENTER));
  sub.setAttribute('y', String(CENTER + 16));
  sub.setAttribute('class', 'ring-sub');
  sub.textContent = options.subLabel ?? (memberCount === 1 ? 'MEMBER' : 'MEMBERS');
  svg.appendChild(sub);
}
