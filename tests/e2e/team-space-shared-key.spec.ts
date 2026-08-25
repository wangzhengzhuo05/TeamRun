import { test, expect } from './helpers/orca-app'

const apiUrl = process.env.TEAMRUN_E2E_API_URL
const sharedKey = process.env.TEAMRUN_E2E_SHARED_KEY

test.skip(!apiUrl || !sharedKey, 'TEAMRUN_E2E_API_URL and TEAMRUN_E2E_SHARED_KEY are required')

test('connects Team Space with a service address and team key', async ({ orcaPage }, testInfo) => {
  await orcaPage.getByRole('button', { name: 'Team Space', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Team Space' })).toBeVisible()

  await orcaPage.getByLabel('Service address').fill(apiUrl as string)
  await orcaPage.getByLabel('Team key').fill(sharedKey as string)
  await orcaPage.getByRole('button', { name: 'Connect with team key' }).click()

  await expect(orcaPage.getByText('TeamRun Pilot', { exact: true })).toBeVisible()
  await expect(orcaPage.locator('body')).not.toContainText('Orca')
  await orcaPage.screenshot({ path: testInfo.outputPath('team-space-shared-key.png') })
})
