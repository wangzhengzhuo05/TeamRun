import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  TeamFile,
  TeamFileVersion,
  TeamFileVersionContent
} from '../../../../shared/teamrun-api'
import { translate } from '@/i18n/i18n'
import { reportTeamRunMutation } from './teamrun-mutation-feedback'
import { teamRunErrorMessage } from './teamrun-error-message'
import {
  bytesToBase64,
  inferTeamFileKind,
  inferTeamFileMimeType,
  textToBase64
} from './team-file-content'

type TeamFilesState = {
  files: TeamFile[]
  selectedFile: TeamFile | null
  versions: TeamFileVersion[]
  selectedVersion: TeamFileVersion | null
  content: TeamFileVersionContent | null
  loading: boolean
  saving: boolean
  refresh: () => Promise<void>
  selectFile: (fileId: string) => void
  selectVersion: (versionId: string) => void
  upload: (uploads: File[]) => Promise<void>
  createDocument: (path: string, content: string) => Promise<boolean>
  saveTextVersion: (content: string) => Promise<void>
  clearQuarantine: () => Promise<void>
  deleteFile: () => Promise<boolean>
}

function reportLoadError(error: unknown): void {
  toast.error(
    teamRunErrorMessage(
      error,
      translate('auto.components.team.space.useTeamFiles.loadError', 'Unable to load Team Files')
    )
  )
}

export function useTeamFiles(projectId: string | null, eventRevision: number): TeamFilesState {
  const [files, setFiles] = useState<TeamFile[]>([])
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [versions, setVersions] = useState<TeamFileVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [content, setContent] = useState<TeamFileVersionContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? null
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null

  const refreshFiles = useCallback(async () => {
    if (!projectId) {
      setFiles([])
      return
    }
    const next = await window.api.teamRun.files.list(projectId)
    setFiles(next)
    setSelectedFileId((current) =>
      current && next.some((file) => file.id === current) ? current : (next[0]?.id ?? null)
    )
  }, [projectId])

  useEffect(() => {
    setFiles([])
    setSelectedFileId(null)
    setVersions([])
    setSelectedVersionId(null)
    setContent(null)
    if (!projectId) {
      return
    }
    let active = true
    setLoading(true)
    void refreshFiles()
      .catch(reportLoadError)
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [projectId, refreshFiles])

  useEffect(() => {
    if (!eventRevision || !projectId) {
      return
    }
    void refreshFiles().catch(reportLoadError)
  }, [eventRevision, projectId, refreshFiles])

  useEffect(() => {
    setVersions([])
    setSelectedVersionId(null)
    setContent(null)
    if (!selectedFile) {
      return
    }
    let active = true
    void window.api.teamRun.files
      .listVersions(selectedFile.id)
      .then((next) => {
        if (!active) {
          return
        }
        setVersions(next)
        setSelectedVersionId(
          next.find((version) => version.version === selectedFile.currentVersion)?.id ??
            next[0]?.id ??
            null
        )
      })
      .catch(reportLoadError)
    return () => {
      active = false
    }
  }, [selectedFile])

  useEffect(() => {
    setContent(null)
    if (!selectedVersion || selectedVersion.availability !== 'available') {
      return
    }
    let active = true
    void window.api.teamRun.files
      .readVersion(selectedVersion.id)
      .then((next) => active && setContent(next))
      .catch(reportLoadError)
    return () => {
      active = false
    }
  }, [selectedVersion])

  const upload = useCallback(
    async (uploads: File[]) => {
      if (!projectId || uploads.length === 0) {
        return
      }
      setSaving(true)
      try {
        for (const upload of uploads) {
          if (upload.size > 524_288) {
            throw new Error('team_file_too_large')
          }
          const path = (upload.webkitRelativePath || upload.name).replaceAll('\\', '/')
          const mimeType = inferTeamFileMimeType(path, upload.type)
          const created = await window.api.teamRun.files.create({
            projectId,
            file: {
              path,
              kind: inferTeamFileKind(path, mimeType),
              mimeType,
              contentBase64: bytesToBase64(new Uint8Array(await upload.arrayBuffer()))
            }
          })
          setSelectedFileId(created.id)
        }
        await refreshFiles()
      } catch (error) {
        reportTeamRunMutation(
          error,
          translate('auto.components.team.space.useTeamFiles.uploadError', 'Unable to upload file')
        )
      } finally {
        setSaving(false)
      }
    },
    [projectId, refreshFiles]
  )

  const createDocument = useCallback(
    async (path: string, value: string) => {
      if (!projectId) {
        return false
      }
      setSaving(true)
      try {
        const created = await window.api.teamRun.files.create({
          projectId,
          file: {
            path,
            kind: 'document',
            mimeType: 'text/markdown',
            contentBase64: textToBase64(value)
          }
        })
        await refreshFiles()
        setSelectedFileId(created.id)
        return true
      } catch (error) {
        reportTeamRunMutation(
          error,
          translate(
            'auto.components.team.space.useTeamFiles.createError',
            'Unable to create document'
          )
        )
        return false
      } finally {
        setSaving(false)
      }
    },
    [projectId, refreshFiles]
  )

  const saveTextVersion = useCallback(
    async (value: string) => {
      if (!selectedFile) {
        return
      }
      setSaving(true)
      try {
        await window.api.teamRun.files.createVersion({
          teamFileId: selectedFile.id,
          version: {
            expectedCurrentVersion: selectedFile.currentVersion,
            mimeType: selectedFile.currentMimeType,
            contentBase64: textToBase64(value)
          }
        })
        await refreshFiles()
      } catch (error) {
        reportTeamRunMutation(
          error,
          translate('auto.components.team.space.useTeamFiles.saveError', 'Unable to save version')
        )
      } finally {
        setSaving(false)
      }
    },
    [refreshFiles, selectedFile]
  )

  const clearQuarantine = useCallback(async () => {
    if (!selectedVersion) {
      return
    }
    try {
      await window.api.teamRun.files.clearQuarantine(selectedVersion.id)
      await refreshFiles()
      setVersions((current) =>
        current.map((version) =>
          version.id === selectedVersion.id
            ? { ...version, availability: 'available', quarantineReason: null }
            : version
        )
      )
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate(
          'auto.components.team.space.useTeamFiles.clearError',
          'Unable to clear quarantine'
        )
      )
    }
  }, [refreshFiles, selectedVersion])

  const deleteFile = useCallback(async () => {
    if (!selectedFile) {
      return false
    }
    try {
      await window.api.teamRun.files.delete(selectedFile.id)
      setSelectedFileId(null)
      await refreshFiles()
      return true
    } catch (error) {
      reportTeamRunMutation(
        error,
        translate('auto.components.team.space.useTeamFiles.deleteError', 'Unable to delete file')
      )
      return false
    }
  }, [refreshFiles, selectedFile])

  return {
    files,
    selectedFile,
    versions,
    selectedVersion,
    content,
    loading,
    saving,
    refresh: refreshFiles,
    selectFile: setSelectedFileId,
    selectVersion: setSelectedVersionId,
    upload,
    createDocument,
    saveTextVersion,
    clearQuarantine,
    deleteFile
  }
}
