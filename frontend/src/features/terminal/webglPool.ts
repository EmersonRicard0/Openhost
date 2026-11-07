// Quem tem desenho acelerado (WebGL): os terminais visíveis e no máximo `keepHidden` recém-escondidos,
// para voltar à aba anterior sem recriar. Os demais são liberados (specs/014, research R2): cada
// contexto WebGL não liberado ficava preso no processo de GPU (~18 MB por aba).
export interface WebglPoolOptions<T> {
  keepHidden: number;
  release: (id: string, handle: T) => void;
}

export interface WebglPool<T> {
  /** `attach` só é chamado se o terminal ainda não tem contexto; `null` = sem WebGL. */
  setVisible(id: string, visible: boolean, attach: () => T | null): void;
  /** Aba fechada: libera na hora. */
  remove(id: string): void;
  /** Contexto perdido pelo navegador: esquece sem liberar de novo. */
  forget(id: string): void;
  size(): number;
}

export function createWebglPool<T>({ keepHidden, release }: WebglPoolOptions<T>): WebglPool<T> {
  const handles = new Map<string, T>();
  const visible = new Set<string>();
  // Escondidos com contexto, do mais antigo para o mais novo.
  const hidden: string[] = [];

  const unhide = (id: string) => {
    const i = hidden.indexOf(id);
    if (i >= 0) hidden.splice(i, 1);
  };
  const drop = (id: string) => {
    const handle = handles.get(id);
    handles.delete(id);
    unhide(id);
    visible.delete(id);
    if (handle !== undefined) release(id, handle);
  };

  return {
    setVisible(id, show, attach) {
      if (show) {
        visible.add(id);
        unhide(id);
        if (!handles.has(id)) {
          const handle = attach();
          if (handle !== null) handles.set(id, handle);
        }
        return;
      }
      if (!visible.delete(id) || !handles.has(id)) return;
      hidden.push(id);
      while (hidden.length > keepHidden) {
        const oldest = hidden[0];
        if (oldest === undefined) break;
        drop(oldest);
      }
    },
    remove: drop,
    forget(id) {
      handles.delete(id);
      unhide(id);
      visible.delete(id);
    },
    size: () => handles.size,
  };
}
