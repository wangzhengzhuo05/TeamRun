import { ipcMain } from 'electron'
import type { TeamRunApiClient } from '../teamrun/teamrun-api-client'
import { invokeTeamRunFileOperation } from '../teamrun/teamrun-file-command'

export function registerTeamRunFileHandlers(client: TeamRunApiClient): void {
  ipcMain.handle('teamrun:files:list', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.list', args)
  )
  ipcMain.handle('teamrun:files:create', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.create', args)
  )
  ipcMain.handle('teamrun:files:listVersions', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.listVersions', args)
  )
  ipcMain.handle('teamrun:files:readVersion', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.readVersion', args)
  )
  ipcMain.handle('teamrun:files:createVersion', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.createVersion', args)
  )
  ipcMain.handle('teamrun:files:listProposals', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.listProposals', args)
  )
  ipcMain.handle('teamrun:files:requestProposal', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.requestProposal', args)
  )
  ipcMain.handle('teamrun:files:applyProposal', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.applyProposal', args)
  )
  ipcMain.handle('teamrun:files:clearQuarantine', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.clearQuarantine', args)
  )
  ipcMain.handle('teamrun:files:delete', (_event, args) =>
    invokeTeamRunFileOperation(client, 'files.delete', args)
  )
}
