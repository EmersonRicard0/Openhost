import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspace } from './workspace';

describe('aba Configurações (FR-908–FR-912)', () => {
  beforeEach(() => {
    useWorkspace.setState({ view: 'terminal', settingsTab: false, settingsSection: null });
  });

  it('abrir cria a aba e a ativa; abrir de novo não cria outra', () => {
    useWorkspace.getState().setView('settings');
    expect(useWorkspace.getState()).toMatchObject({ view: 'settings', settingsTab: true });
    useWorkspace.getState().openSettings('sync');
    expect(useWorkspace.getState()).toMatchObject({
      view: 'settings',
      settingsTab: true,
      settingsSection: 'sync',
    });
  });

  it('voltar às abas deixa a aba Configurações aberta', () => {
    useWorkspace.getState().setView('settings');
    useWorkspace.getState().setView('terminal');
    expect(useWorkspace.getState()).toMatchObject({ view: 'terminal', settingsTab: true });
  });

  it('fechar remove a aba e volta às sessões', () => {
    useWorkspace.getState().openSettings('appearance');
    useWorkspace.getState().closeSettings();
    expect(useWorkspace.getState()).toMatchObject({
      view: 'terminal',
      settingsTab: false,
      settingsSection: null,
    });
  });

  it('fechar com a aba inativa não muda a sessão mostrada', () => {
    useWorkspace.getState().setView('settings');
    useWorkspace.getState().setView('terminal');
    useWorkspace.getState().closeSettings();
    expect(useWorkspace.getState()).toMatchObject({ view: 'terminal', settingsTab: false });
  });
});
