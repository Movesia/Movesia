/**
 * Agent IPC Handlers
 *
 * Registers ipcMain handlers that bridge renderer requests to the AgentService.
 * Streaming events are pushed to the renderer via webContents.send().
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { AgentChannels } from '@/channels/agentChannels';
import type { AgentService } from '@/services/agent-service';

export function registerAgentIpc(
  mainWindow: BrowserWindow,
  agentService: AgentService
): void {
  // ── Chat (streaming) ────────────────────────────────────────────────
  ipcMain.handle(AgentChannels.CHAT_SEND, async (_event, request) => {
    try {
      const { threadId } = await agentService.handleChat(request, (event) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(AgentChannels.CHAT_STREAM_EVENT, event);
        }
      });
      return { threadId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
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
