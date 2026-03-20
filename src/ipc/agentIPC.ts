/**
 * Agent IPC Handlers
 *
 * Registers ipcMain handlers that bridge renderer requests to the AgentService.
 * Streaming events are pushed to the renderer via webContents.send().
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { AgentChannels } from '@/channels/agentChannels';
import type { AgentService } from '@/services/agent-service';
import { getLastProject, clearLastProject } from '@/services/app-settings';
import { isUnityProject } from '@/services/unity-project-scanner';
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

  // ── Chat abort ────────────────────────────────────────────────────
  ipcMain.handle(AgentChannels.CHAT_ABORT, () => {
    log.info('[IPC] Chat abort requested by renderer');
    agentService.abortChat();
  });

  // ── Tool approval response (HITL) ─────────────────────────────────
  ipcMain.handle(AgentChannels.CHAT_TOOL_APPROVAL_RESPONSE, async (_event, payload) => {
    const { threadId, decision } = payload;
    log.info(`[IPC] Tool approval response: thread=${threadId?.slice(0, 16)}... decision=${decision?.type}`);
    try {
      return await agentService.handleToolApprovalResponse(threadId, decision, (event) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(AgentChannels.CHAT_STREAM_EVENT, event);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[IPC] Tool approval error: ${message}`);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(AgentChannels.CHAT_STREAM_ERROR, message);
      }
      throw error;
    }
  });

  // ── Threads ─────────────────────────────────────────────────────────
  ipcMain.handle(AgentChannels.THREADS_LIST, (_event, projectPath?: string) =>
    agentService.listThreads(projectPath)
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

  // ── Settings ─────────────────────────────────────────────────────────
  ipcMain.handle(AgentChannels.SETTINGS_GET_LAST_PROJECT, async () => {
    const last = getLastProject();
    if (!last) return null;

    // Validate the project still exists on disk
    const valid = await isUnityProject(last.path);
    if (!valid) {
      log.info(`[Settings] Last project no longer valid, clearing: ${last.path}`);
      clearLastProject();
      return null;
    }

    return last;
  });
}
