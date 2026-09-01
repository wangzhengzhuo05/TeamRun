import {
  expect,
  test,
  type ElectronApplication,
  type Page,
  type TestInfo
} from './helpers/orca-app'

test.setTimeout(180_000)

async function installTeamRunMocks(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ ipcMain }) => {
    const timestamp = '2026-08-26T08:00:00.000Z'
    const ids = {
      org: '00000000-0000-4000-8000-000000000001',
      project: '00000000-0000-4000-8000-000000000002',
      task: '00000000-0000-4000-8000-000000000003',
      user: '00000000-0000-4000-8000-000000000004',
      snapshot: '00000000-0000-4000-8000-000000000005',
      run: '00000000-0000-4000-8000-000000000006',
      publication: '00000000-0000-4000-8000-000000000007'
    }
    const task = {
      id: ids.task,
      organizationId: ids.org,
      projectId: ids.project,
      repositoryId: '00000000-0000-4000-8000-000000000008',
      number: 128,
      title: 'Prevent toolbar actions from overlapping at compact window sizes',
      descriptionMarkdown:
        'Keep the primary workflow readable at every supported desktop window size.\n\n- Preserve action hierarchy\n- Avoid clipped icons\n- Keep controls keyboard accessible',
      status: 'in_progress',
      ownerUserId: ids.user,
      version: 3,
      externalSource: {
        provider: 'gitlab',
        externalId: 'UI-128',
        url: 'https://gitlab.example/teamrun/ui/issues/128',
        importedAt: timestamp,
        importedMarkdown: 'Imported issue context'
      },
      createdAt: timestamp,
      updatedAt: timestamp
    }
    const handlers = new Map<string, unknown>([
      [
        'teamrun:authStatus',
        {
          state: 'signed-in',
          userId: ids.user,
          email: 'developer@teamrun.local',
          apiUrl: 'https://teamrun.local',
          devAuth: true,
          sharedKeyAuth: false
        }
      ],
      ['teamrun:sync:status', { connection: 'online', pendingMutations: 0 }],
      [
        'teamrun:organizations:list',
        [
          {
            id: ids.org,
            slug: 'product-platform',
            name: 'Product Platform and Developer Experience',
            role: 'owner',
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:projects:list',
        [
          {
            id: ids.project,
            organizationId: ids.org,
            key: 'DESKTOP',
            name: 'Cross-platform Desktop Experience',
            contextMarkdown: 'Shared project context',
            contextVersion: 2,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:repositories:list',
        [
          {
            id: '00000000-0000-4000-8000-000000000008',
            projectId: ids.project,
            provider: 'gitlab',
            remoteUrl: 'https://gitlab.example/teamrun/desktop.git',
            displayName: 'teamrun-desktop-client-with-long-name',
            defaultBranch: 'main',
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:tasks:list',
        [
          task,
          {
            ...task,
            id: `${ids.task.slice(0, -1)}9`,
            number: 127,
            title: 'Audit dialogs and empty states',
            status: 'in_review',
            externalSource: null
          }
        ]
      ],
      ['teamrun:tasks:get', task],
      [
        'teamrun:organizations:listMembers',
        [
          {
            userId: ids.user,
            email: 'developer@teamrun.local',
            displayName: 'Alexandra Developer',
            role: 'owner',
            joinedAt: timestamp
          },
          {
            userId: `${ids.user.slice(0, -1)}a`,
            email: 'reviewer@teamrun.local',
            displayName: 'Morgan Cross-platform Reviewer',
            role: 'member',
            joinedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:organizations:listInviteCodes',
        [
          {
            id: `${ids.user.slice(0, -1)}b`,
            organizationId: ids.org,
            codeHint: '8A3F',
            status: 'active',
            createdByUserId: ids.user,
            redeemedByUserId: null,
            expiresAt: '2026-09-02T08:00:00.000Z',
            redeemedAt: null,
            revokedAt: null,
            createdAt: timestamp
          }
        ]
      ],
      [
        'teamrun:comments:list',
        [
          {
            id: `${ids.user.slice(0, -1)}c`,
            organizationId: ids.org,
            taskId: ids.task,
            authorUserId: ids.user,
            bodyMarkdown:
              'The compact layout currently allows multiple toolbar icons to occupy the same visual area.',
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:snapshots:list',
        [
          {
            id: ids.snapshot,
            organizationId: ids.org,
            taskId: ids.task,
            taskVersion: 3,
            projectContextVersion: 2,
            commentWatermark: timestamp,
            renderedMarkdown:
              '# Frozen task context\n\nUse the canonical design tokens and validate compact widths.',
            hash: 'a'.repeat(64),
            createdByUserId: ids.user,
            createdAt: timestamp
          }
        ]
      ],
      [
        'teamrun:runs:list',
        [
          {
            id: ids.run,
            organizationId: ids.org,
            taskId: ids.task,
            contextSnapshotId: ids.snapshot,
            ownerUserId: ids.user,
            agentKind: 'codex',
            teamAgentSnapshot: null,
            status: 'review',
            stale: false,
            baseRevision: { kind: 'git', objectId: 'b'.repeat(40) },
            clientRunId: 'visual-audit-run',
            lastSequence: 3,
            lastHeartbeatAt: timestamp,
            startedAt: timestamp,
            completedAt: null,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:publications:list',
        [
          {
            id: ids.publication,
            organizationId: ids.org,
            taskId: ids.task,
            agentRunId: ids.run,
            revision: 1,
            summaryMarkdown:
              '## Result\n\nResponsive toolbar layout and visual regression coverage.',
            headRevision: { kind: 'git', objectId: 'c'.repeat(40) },
            commitGitObjectIds: ['c'.repeat(40)],
            reviewUrl: 'https://gitlab.example/teamrun/desktop/merge_requests/42',
            publishedByUserId: ids.user,
            publishedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:verifications:list',
        [
          {
            id: `${ids.run.slice(0, -1)}d`,
            agentRunId: ids.run,
            commandId: 'lint',
            commandLabel: 'Lint',
            command: 'pnpm lint',
            exitCode: 0,
            durationMs: 4312,
            output: 'passed',
            createdAt: timestamp
          }
        ]
      ],
      [
        'teamrun:publications:listArtifacts',
        [
          {
            clientArtifactId: 'diff',
            kind: 'unified_diff',
            fileName: 'responsive-toolbar.patch',
            contentType: 'text/x-diff',
            byteSize: 2048,
            sha256: 'd'.repeat(64),
            downloadUrl: 'https://teamrun.local/artifacts/diff',
            expiresAt: '2026-08-27T08:00:00.000Z'
          }
        ]
      ],
      [
        'teamrun:channels:list',
        [
          {
            id: `${ids.project.slice(0, -1)}e`,
            organizationId: ids.org,
            projectId: ids.project,
            name: 'desktop-ux',
            description: 'Desktop UX coordination',
            createdByUserId: ids.user,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:channels:listMessages',
        [
          {
            id: `${ids.project.slice(0, -1)}f`,
            organizationId: ids.org,
            channelId: `${ids.project.slice(0, -1)}e`,
            authorUserId: ids.user,
            bodyMarkdown: 'Please validate both light and dark themes at compact widths.',
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      ],
      [
        'teamrun:teamAgents:list',
        [
          {
            id: `${ids.snapshot.slice(0, -1)}a`,
            organizationId: ids.org,
            projectId: ids.project,
            name: 'Desktop visual reviewer',
            agentKind: 'codex',
            launchCommand: null,
            instructionsMarkdown: 'Review hierarchy, spacing, overflow, and focus states.',
            version: 1,
            createdByUserId: ids.user,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      ],
      ['teamrun:runs:resolveWorkspace', null],
      ['teamrun:events:start', undefined],
      ['teamrun:events:stop', undefined]
    ])
    for (const [channel, result] of handlers) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => result)
    }
  })
}

async function setViewport(page: Page, width: number, height = 800): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(100)
}

async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.mouse.move(1, 1)
  await page.waitForTimeout(100)
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' })
}

async function expectNoInteractiveOverlaps(page: Page): Promise<void> {
  const overlaps = await page.locator('.team-space-shell').evaluate((root) => {
    const rootRect = root.getBoundingClientRect()
    const visibleRect = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      let left = Math.max(rect.left, rootRect.left, 0)
      let top = Math.max(rect.top, rootRect.top, 0)
      let right = Math.min(rect.right, rootRect.right, innerWidth)
      let bottom = Math.min(rect.bottom, rootRect.bottom, innerHeight)
      for (let ancestor = element.parentElement; ancestor && ancestor !== root; ) {
        const style = getComputedStyle(ancestor)
        const ancestorRect = ancestor.getBoundingClientRect()
        if (/(auto|hidden|scroll|clip)/.test(style.overflowX)) {
          left = Math.max(left, ancestorRect.left)
          right = Math.min(right, ancestorRect.right)
        }
        if (/(auto|hidden|scroll|clip)/.test(style.overflowY)) {
          top = Math.max(top, ancestorRect.top)
          bottom = Math.min(bottom, ancestorRect.bottom)
        }
        ancestor = ancestor.parentElement
      }
      return { left, top, right, bottom, width: right - left, height: bottom - top }
    }
    const elements = [...root.querySelectorAll<HTMLElement>('button')].filter((element) => {
      const style = getComputedStyle(element)
      const rect = visibleRect(element)
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      )
    })
    const failures: string[] = []
    const label = (element: HTMLElement) =>
      element.getAttribute('aria-label') ?? element.innerText.trim().replaceAll(/\s+/g, ' ')
    for (let leftIndex = 0; leftIndex < elements.length; leftIndex += 1) {
      const left = elements[leftIndex]
      const leftRect = visibleRect(left)
      const leftLayoutRect = left.getBoundingClientRect()
      if (leftLayoutRect.left < rootRect.left - 1 || leftLayoutRect.right > rootRect.right + 1) {
        failures.push(`${label(left)} outside Team Space`)
      }
      for (let rightIndex = leftIndex + 1; rightIndex < elements.length; rightIndex += 1) {
        const right = elements[rightIndex]
        const rightRect = visibleRect(right)
        const overlapWidth =
          Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left)
        const overlapHeight =
          Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top)
        if (overlapWidth <= 1 || overlapHeight <= 1) {
          continue
        }
        failures.push(`${label(left)} <> ${label(right)}`)
      }
    }
    return failures
  })
  expect(overlaps).toEqual([])
}

test('audits primary app and Team Space layouts', async ({ electronApp, orcaPage }, testInfo) => {
  await installTeamRunMocks(electronApp)
  for (const width of [1600, 1280, 960]) {
    await setViewport(orcaPage, width)
    await screenshot(orcaPage, testInfo, `app-workspace-${width}`)
  }
  await setViewport(orcaPage, 1600, 900)
  await orcaPage.getByRole('button', { name: 'Team Space', exact: true }).click()
  await expect(orcaPage.getByText(/Please validate both light and dark themes/)).toBeVisible()
  await expect(orcaPage.getByLabel('Message', { exact: true })).toBeVisible()

  for (const width of [1600, 1280, 1100, 960]) {
    await setViewport(orcaPage, width)
    await expectNoInteractiveOverlaps(orcaPage)
    await screenshot(orcaPage, testInfo, `team-space-${width}`)
  }

  await setViewport(orcaPage, 1280)
  const teamSpaceDock = orcaPage.locator('.team-space-dock')
  await teamSpaceDock.getByRole('button', { name: 'Tasks', exact: true }).click()
  await orcaPage.getByText('#128', { exact: false }).click()
  await expect(orcaPage.getByRole('tab', { name: 'Overview' })).toBeVisible()
  for (const tab of ['Overview', 'Context', 'Agent runs', 'Results']) {
    await orcaPage.getByRole('tab', { name: tab }).click()
    await expectNoInteractiveOverlaps(orcaPage)
    await screenshot(orcaPage, testInfo, `team-space-${tab.toLowerCase().replaceAll(' ', '-')}`)
  }

  await teamSpaceDock.getByRole('button', { name: 'Team management', exact: true }).click()
  await expect(orcaPage.getByRole('dialog')).toBeVisible()
  await screenshot(orcaPage, testInfo, 'team-space-dialog-members')
  await orcaPage.getByRole('tab', { name: 'Team Agents' }).click()
  await screenshot(orcaPage, testInfo, 'team-space-dialog-agents')
  await orcaPage.keyboard.press('Escape')

  const moreButton = teamSpaceDock.getByRole('button', { name: 'More', exact: true })
  await moreButton.click()
  await screenshot(orcaPage, testInfo, 'team-space-more')
  for (const trigger of ['Join Team', 'New organization', 'New project', 'Add repository']) {
    const triggerButton = orcaPage.getByRole('button', { name: trigger, exact: true })
    if (!(await triggerButton.isVisible())) {
      await moreButton.click()
    }
    await triggerButton.click()
    await expect(orcaPage.getByRole('dialog')).toBeVisible()
    await screenshot(
      orcaPage,
      testInfo,
      `team-space-dialog-${trigger.toLowerCase().replaceAll(' ', '-')}`
    )
    await orcaPage.keyboard.press('Escape')
  }
  await moreButton.click()

  const taskBackButton = orcaPage
    .getByRole('main')
    .getByRole('button', { name: 'Tasks', exact: true })
  if (await taskBackButton.isVisible()) {
    await taskBackButton.click()
  }
  for (const trigger of ['New task', 'Import']) {
    await orcaPage.getByRole('button', { name: trigger, exact: true }).click()
    await expect(orcaPage.getByRole('dialog')).toBeVisible()
    await screenshot(
      orcaPage,
      testInfo,
      `team-space-dialog-${trigger.toLowerCase().replaceAll(' ', '-')}`
    )
    await orcaPage.keyboard.press('Escape')
  }

  await setViewport(orcaPage, 960)
  await orcaPage.getByText('#128', { exact: false }).click()
  for (const tab of ['Overview', 'Context', 'Agent runs', 'Results']) {
    await orcaPage.getByRole('tab', { name: tab }).click()
    await expectNoInteractiveOverlaps(orcaPage)
    await screenshot(
      orcaPage,
      testInfo,
      `team-space-compact-${tab.toLowerCase().replaceAll(' ', '-')}`
    )
    if (tab === 'Agent runs') {
      await orcaPage.getByText('Ready for review', { exact: true }).scrollIntoViewIfNeeded()
      await expectNoInteractiveOverlaps(orcaPage)
      await screenshot(orcaPage, testInfo, 'team-space-compact-agent-run-card')
    }
  }

  await setViewport(orcaPage, 1600, 900)
  const sidebarNavigation = orcaPage.locator('[data-contextual-tour-target="sidebar-navigation"]')
  for (const destination of ['Tasks', 'Automations', 'TeamRun Mobile']) {
    await sidebarNavigation.getByRole('button', { name: destination }).click()
    await orcaPage.waitForTimeout(300)
    for (const width of [1600, 1280, 960]) {
      await setViewport(orcaPage, width)
      await screenshot(
        orcaPage,
        testInfo,
        `app-${destination.toLowerCase().replaceAll(' ', '-')}-${width}`
      )
    }
  }

  await orcaPage.evaluate(() => window.__store?.getState().openSettingsPage())
  await expect(orcaPage.getByRole('heading', { name: 'General' })).toBeVisible()
  for (const width of [1600, 1280, 960]) {
    await setViewport(orcaPage, width)
    await screenshot(orcaPage, testInfo, `app-settings-${width}`)
  }
})
