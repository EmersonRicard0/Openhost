// Fila de transferências SFTP (FR-020, FR-021): até 3 simultâneas, cada uma em canal próprio,
// gravando em arquivo parcial e renomeando só ao concluir.
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, posix } from 'node:path';
import type { SFTPWrapper, TransferOptions } from 'ssh2';
import type { ConflictChoice, ConflictEvent, Transfer, TransferState } from '@shared/model/types';
import { fail, toAppError } from '../ipc/messages';
import { renamePath, statIfExists, statPath, unlinkPath } from './browser';
import { canTransition, isFinal, partialName, planConflictChoice } from './partial';

/** Sessão SFTP vista pela fila: canal do navegador e criação de canais extras. */
export interface SftpEndpoint {
  readonly sessionId: string;
  readonly browse: SFTPWrapper;
  channel(): Promise<SFTPWrapper>;
}

export interface TransferEvents {
  transfer(t: Transfer): void;
  conflict(c: ConflictEvent): void;
}

export interface TransferManagerOptions {
  concurrency?: number;
  /** Intervalo mínimo entre eventos de progresso (10/s por padrão). */
  progressIntervalMs?: number;
}

interface Job {
  readonly t: Transfer;
  readonly batch: string;
  readonly endpoint: SftpEndpoint;
  /** Caminho final no destino (remoto no envio, local no download). */
  readonly target: string;
  readonly partial: string;
  replace: boolean;
  cancelRequested: boolean;
  channel: SFTPWrapper | null;
  answer: ((choice: ConflictChoice) => void) | null;
  lastEmit: number;
}

type Xfer = (
  src: string,
  dst: string,
  opts: TransferOptions,
  cb: (err: Error | null | undefined) => void,
) => void;

// 32 pedidos de 128 KiB em voo: medido com scripts/bench-sftp.mjs contra o OpenSSH (SC-006).
// O ssh2 divide pedidos maiores que o limite anunciado pelo servidor.
const XFER_TUNING = { concurrency: 32, chunkSize: 128 * 1024 } as const;

// Lido após awaits: o cancelamento chega de fora enquanto a transferência roda.
const cancelled = (job: Job): boolean => job.cancelRequested;

export class TransferManager {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private running = 0;
  private readonly concurrency: number;
  private readonly progressMs: number;

  constructor(
    private readonly events: TransferEvents,
    options: TransferManagerOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 3;
    this.progressMs = options.progressIntervalMs ?? 100;
  }

  upload(endpoint: SftpEndpoint, localPaths: readonly string[], remoteDir: string): string[] {
    const files = localPaths.map((path) => ({ path, size: statSync(path).size }));
    const batch = randomUUID();
    return files.map(({ path, size }) => {
      const target = posix.join(remoteDir, basename(path));
      return this.add(endpoint, batch, 'upload', path, target, target, size);
    });
  }

  async download(
    endpoint: SftpEndpoint,
    remotePaths: readonly string[],
    localDir: string,
  ): Promise<string[]> {
    const files: { path: string; size: number }[] = [];
    for (const path of remotePaths) {
      const stats = await statPath(endpoint.browse, path);
      if (!stats.isFile()) throw fail('INVALID_INPUT');
      files.push({ path, size: stats.size });
    }
    const batch = randomUUID();
    return files.map(({ path, size }) => {
      const target = join(localDir, posix.basename(path));
      return this.add(endpoint, batch, 'download', target, path, target, size);
    });
  }

  resolveConflict(id: string, choice: ConflictChoice): void {
    const job = this.get(id);
    job.answer?.(choice);
  }

  cancel(id: string): void {
    const job = this.get(id);
    if (isFinal(job.t.state)) return;
    job.cancelRequested = true;
    if (job.t.state === 'running') {
      // Fechar o canal interrompe fastPut/fastGet; a limpeza acontece em run().
      job.channel?.end();
      return;
    }
    this.setState(job, 'cancelled');
    job.answer?.('skip');
  }

  cancelSession(sessionId: string): void {
    for (const job of this.jobs.values()) {
      if (job.endpoint.sessionId === sessionId) this.cancel(job.t.id);
    }
  }

  activeCount(): number {
    let n = 0;
    for (const job of this.jobs.values()) if (!isFinal(job.t.state)) n++;
    return n;
  }

  private get(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw fail('NOT_FOUND');
    return job;
  }

  private add(
    endpoint: SftpEndpoint,
    batch: string,
    direction: Transfer['direction'],
    localPath: string,
    remotePath: string,
    target: string,
    size: number,
  ): string {
    const id = randomUUID();
    const job: Job = {
      t: {
        id,
        sessionId: endpoint.sessionId,
        direction,
        localPath,
        remotePath,
        bytesTotal: size,
        bytesDone: 0,
        state: 'queued',
        reason: null,
      },
      batch,
      endpoint,
      target,
      partial:
        direction === 'upload'
          ? posix.join(posix.dirname(target), partialName(posix.basename(target), id))
          : join(dirname(target), partialName(basename(target), id)),
      replace: false,
      cancelRequested: false,
      channel: null,
      answer: null,
      lastEmit: 0,
    };
    this.jobs.set(id, job);
    this.emit(job);
    void this.prepare(job);
    return id;
  }

  /** Verifica conflito antes de entrar na fila de execução. */
  private async prepare(job: Job): Promise<void> {
    try {
      const existing = await this.existing(job);
      if (existing && !isFinal(job.t.state)) {
        const choice = await new Promise<ConflictChoice>((resolve) => {
          job.answer = resolve;
          this.events.conflict({
            transferId: job.t.id,
            name: job.t.direction === 'upload' ? posix.basename(job.target) : basename(job.target),
            existingSize: existing.size,
            existingModifiedAt: existing.modifiedAt,
          });
        });
        job.answer = null;
        if (isFinal(job.t.state)) return;
        this.applyChoice(job, choice);
      }
      if (isFinal(job.t.state)) return;
      this.queue.push(job);
      this.pump();
    } catch (e) {
      if (!isFinal(job.t.state)) this.setState(job, 'failed', toAppError(e).message);
    }
  }

  private applyChoice(job: Job, choice: ConflictChoice): void {
    if (choice === 'replace') job.replace = true;
    const batch = [...this.jobs.values()].filter((j) => j.batch === job.batch);
    const plan = planConflictChoice(
      batch.map((j) => j.t),
      job.t.id,
      choice,
    );
    for (const other of batch) {
      const next = plan.get(other.t.id);
      if (!next || isFinal(other.t.state)) continue;
      this.setState(other, next);
      // Quem ainda esperava resposta de conflito é liberado (e vê o estado final).
      if (other !== job) other.answer?.('skip');
    }
  }

  private async existing(job: Job): Promise<{ size: number; modifiedAt: string } | null> {
    if (job.t.direction === 'upload') {
      const stats = await statIfExists(job.endpoint.browse, job.target);
      return stats && { size: stats.size, modifiedAt: new Date(stats.mtime * 1000).toISOString() };
    }
    try {
      const stats = await stat(job.target);
      return { size: stats.size, modifiedAt: stats.mtime.toISOString() };
    } catch (e) {
      if ((e as { code?: unknown }).code === 'ENOENT') return null;
      throw e;
    }
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const job = this.queue.shift();
      if (!job) return;
      if (isFinal(job.t.state)) continue;
      this.running++;
      void this.run(job).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<void> {
    this.setState(job, 'running');
    let channel: SFTPWrapper | null = null;
    try {
      channel = await job.endpoint.channel();
      job.channel = channel;
      if (cancelled(job)) throw fail('CANCELLED');
      const sftp = channel;
      const step: TransferOptions['step'] = (done) => {
        job.t.bytesDone = done;
        const now = Date.now();
        if (now - job.lastEmit >= this.progressMs) {
          job.lastEmit = now;
          this.emit(job);
        }
      };
      const upload = job.t.direction === 'upload';
      const xfer: Xfer = upload ? sftp.fastPut.bind(sftp) : sftp.fastGet.bind(sftp);
      const [src, dst] = upload ? [job.t.localPath, job.partial] : [job.t.remotePath, job.partial];
      await new Promise<void>((resolve, reject) => {
        xfer(src, dst, { step, ...XFER_TUNING }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      if (cancelled(job)) throw fail('CANCELLED');
      if (upload) {
        // SFTP v3 não sobrescreve no rename: o existente sai antes (só com "substituir").
        if (job.replace && (await statIfExists(sftp, job.target)))
          await unlinkPath(sftp, job.target);
        await renamePath(sftp, job.partial, job.target);
      } else {
        await rename(job.partial, job.target);
      }
      job.t.bytesDone = job.t.bytesTotal;
      this.setState(job, 'completed');
    } catch (e) {
      await this.removePartial(job);
      if (cancelled(job)) this.setState(job, 'cancelled');
      else this.setState(job, 'failed', toAppError(e).message);
    } finally {
      job.channel = null;
      channel?.end();
    }
  }

  private async removePartial(job: Job): Promise<void> {
    try {
      if (job.t.direction === 'upload') {
        if (await statIfExists(job.endpoint.browse, job.partial)) {
          await unlinkPath(job.endpoint.browse, job.partial);
        }
      } else {
        await rm(job.partial, { force: true, maxRetries: 5, retryDelay: 50 });
      }
    } catch {
      // Sem conexão não há como apagar o parcial remoto; o nome final nunca é usado.
    }
  }

  private setState(job: Job, state: TransferState, reason: string | null = null): void {
    if (!canTransition(job.t.state, state)) return;
    job.t.state = state;
    job.t.reason = reason;
    this.emit(job);
  }

  private emit(job: Job): void {
    this.events.transfer({ ...job.t });
  }
}
