import { describe, expect, it } from 'vitest';
import { titleBarLayout } from './TitleBar';

describe('barra de título por sistema', () => {
  it('Windows: botões próprios e cabeçalho arrastável', () => {
    expect(titleBarLayout('windows')).toEqual({
      windowControls: true,
      draggable: true,
      insetLeft: false,
    });
  });

  it('macOS: botões nativos à esquerda, cabeçalho arrastável', () => {
    expect(titleBarLayout('darwin')).toEqual({
      windowControls: false,
      draggable: true,
      insetLeft: true,
    });
  });

  it('Linux: moldura do sistema, sem botões nem arrasto do app', () => {
    expect(titleBarLayout('linux')).toEqual({
      windowControls: false,
      draggable: false,
      insetLeft: false,
    });
  });
});
