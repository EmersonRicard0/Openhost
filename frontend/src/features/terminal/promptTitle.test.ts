import { describe, expect, it } from 'vitest';
import { extractPromptName } from './promptTitle';

describe('extractPromptName (FR-922, SC-906)', () => {
  it.each([
    ['<BNG.PINDORETAMA>', 'BNG.PINDORETAMA'], // Huawei, modo usuário
    ['[~BNG.PINDORETAMA]', 'BNG.PINDORETAMA'], // Huawei, configuração não confirmada
    ['[*OLT-01]', 'OLT-01'],
    ['[OLT-01]', 'OLT-01'],
    ['ZXAN#', 'ZXAN'], // ZTE
    ['R1>', 'R1'], // Cisco, modo usuário
    ['R1(config-if)#', 'R1'],
    ['DM4610# ', 'DM4610'], // Datacom, com espaço depois
    ['ops@MX-CORE> ', 'MX-CORE'], // Juniper
    ['[admin@MikroTik] > ', 'MikroTik'],
    ['user@srv:~$ ', 'srv'],
    ['root@srv:/etc# ', 'srv'],
    ['[root@srv01 ~]# ', 'srv01'], // RHEL
  ])('%s → %s', (line, name) => {
    expect(extractPromptName(line)).toBe(name);
  });

  it.each([
    '',
    '$ ',
    '# ',
    'bash-5.1$ ',
    'Building configuration...',
    '  ---- More ----',
    'Total: 5 interfaces up',
    'interface GigabitEthernet0/0/1',
    '12345#',
    '<1>',
    `<${'A'.repeat(65)}>`,
    '<BNG\u0007X>',
    'ping 10.0.0.1 -> ok#',
  ])('recusa %j', (line) => {
    expect(extractPromptName(line)).toBeNull();
  });
});
