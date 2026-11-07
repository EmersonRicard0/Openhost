import { describe, expect, it } from 'vitest';
import { OS_IDS } from '@shared/model/types';
import { OS_OPTIONS, hostOs, osLabel, osLogoColors } from './osIcons';

describe('logo do sistema no host (FR-178)', () => {
  it('todo id do data-model tem rótulo e aparece uma vez no seletor', () => {
    for (const id of OS_IDS) expect(osLabel(id)).not.toBe('');
    expect(new Set(OS_OPTIONS.map((o) => o.id)).size).toBe(OS_IDS.length);
  });

  it('escolha do usuário vence; automático usa o detectado', () => {
    expect(hostOs({ osIcon: 'auto', detectedOs: 'alpine' })).toBe('alpine');
    expect(hostOs({ osIcon: 'cisco', detectedOs: 'alpine' })).toBe('cisco');
    expect(hostOs({ osIcon: 'auto', detectedOs: null })).toBeNull();
    // Cofre anterior ao FR-178: sem os campos.
    expect(hostOs({})).toBeNull();
  });

  it('logo na cor oficial quando ela se destaca do quadrado; senão na cor do texto', () => {
    expect(osLogoColors('cisco')).toEqual({ dark: '#1BA0D7', light: '#1BA0D7' });
    expect(osLogoColors('huawei')).toEqual({ dark: '#FF0000', light: '#FF0000' });
    // Maçã preta: some no escuro, aparece no claro.
    expect(osLogoColors('macos')).toEqual({ dark: null, light: '#000000' });
    // Pinguim amarelo: o contrário.
    expect(osLogoColors('linux')).toEqual({ dark: '#FCC624', light: null });
    for (const id of OS_IDS) {
      const { dark, light } = osLogoColors(id);
      expect(dark ?? light, id).not.toBeUndefined();
    }
  });

  it('ZTE, Datacom e Hillstone têm rótulo, desenho próprio e cor quando conhecida (FR-502)', () => {
    expect(osLabel('zte')).toBe('ZTE');
    expect(osLabel('datacom')).toBe('Datacom');
    expect(osLabel('hillstone')).toBe('Hillstone');
    expect(osLogoColors('zte')).toEqual({ dark: '#008ED3', light: '#008ED3' });
    // Azul-marinho some no quadrado escuro: lá usa a cor do texto.
    expect(osLogoColors('hillstone')).toEqual({ dark: null, light: '#003285' });
    expect(osLogoColors('datacom')).toEqual({ dark: null, light: null });
  });
});
