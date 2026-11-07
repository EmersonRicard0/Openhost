// Pressionado pelo teclado (specs/015, FR-1508): Enter/espaço num botão, aba, item de lista ou de
// menu ganha `data-pressed` até soltar a tecla ou sair do foco — o mesmo visual do `:active` do
// mouse. Um só ouvinte no documento, sem nada por componente.
const PRESSABLE =
  'button, [role="button"], [role="tab"], [role="treeitem"], [role="menuitem"], [role="option"]';

export function pressTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>(PRESSABLE);
}

export function installKeyboardPress(doc: Document = document): () => void {
  let pressed: HTMLElement | null = null;
  const release = () => {
    if (pressed) delete pressed.dataset.pressed;
    pressed = null;
  };
  const down = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.repeat) return;
    const el = pressTarget(e.target);
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
    release();
    pressed = el;
    el.dataset.pressed = '';
  };
  const up = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') release();
  };
  doc.addEventListener('keydown', down, true);
  doc.addEventListener('keyup', up, true);
  doc.addEventListener('focusout', release, true);
  return () => {
    release();
    doc.removeEventListener('keydown', down, true);
    doc.removeEventListener('keyup', up, true);
    doc.removeEventListener('focusout', release, true);
  };
}
