/**
 * Agent IPC Handlers
 *
 * Registers ipcMain handlers that bridge renderer requests to the AgentService.
 * Streaming events are pushed to the renderer via webContents.send().
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { AgentChannels } from '@/channels/agentChannels';
import type { AgentService } from '@/services/agent-service';
import { createLogger } from '@/agent/UnityConnection/config';

const log = createLogger('movesia.ipc');

export function registerAgentIpc(
  mainWindow: BrowserWindow,
  agentService: AgentService
): void {
  // ── Chat (streaming) ────────────────────────────────────────────────
  ipcMain.handle(AgentChannels.CHAT_SEND, async (_event, request) => {
    let ipcEventCount = 0;
    const ipcStart = Date.now();

    try {
      const { threadId } = await agentService.handleChat(request, (event) => {
        ipcEventCount++;
        if (ipcEventCount <= 5 || event.type === 'done' || event.type === 'error') {
          log.debug(`[IPC→Renderer] #${ipcEventCount} type="${event.type}" destroyed=${mainWindow.isDestroyed()}`);
        }
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(AgentChannels.CHAT_STREAM_EVENT, event);
        }
      });

      log.debug(`[IPC] Chat done: ${ipcEventCount} events sent to renderer in ${((Date.now() - ipcStart) / 1000).toFixed(2)}s`);
      return { threadId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      log.error(`[IPC] Chat error after ${ipcEventCount} events: ${message}`);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(AgentChannels.CHAT_STREAM_ERROR, message);
      }
      throw error;
    }
  });

  // ── Threads ─────────────────────────────────────────────────────────
  ipcMain.handle(AgentChannels.THREADS_LIST, () =>
    agentService.listThreads()
  );

  ipcMain.handle(AgentChannels.THREADS_DELETE, (_event, threadId: string) =>
    agentService.deleteThread(threadId)
  );

  ipcMain.handle(AgentChannels.THREAD_MESSAGES, (_event, threadId: string) =>
    agentService.getThreadMessages(threadId)
  );

  // ── Unity ───────────────────────────────────────────────────────────
  ipcMain.handle(AgentChannels.UNITY_STATUS, () =>
    agentService.getUnityStatus()
  );

  ipcMain.handle(AgentChannels.UNITY_SET_PROJECT, (_event, path: string) =>
    agentService.setProjectPath(path)
  );
}
