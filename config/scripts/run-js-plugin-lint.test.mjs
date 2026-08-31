import { describe, expect, it } from 'vitest'
import reactDoctorPlugin from 'oxlint-plugin-react-doctor'
import { lintSourceWithPlugins } from './run-js-plugin-lint.mjs'

function lintReactDoctor(source, rule) {
  return lintSourceWithPlugins({
    filename: `${process.cwd()}/sample.tsx`,
    source,
    plugins: [{ name: 'react-doctor', plugin: reactDoctorPlugin }],
    rules: { [`react-doctor/${rule}`]: 'warn' }
  })
}

describe('JavaScript plugin lint host', () => {
  it('runs React Doctor node visitors', () => {
    const diagnostics = lintReactDoctor(
      'export const List = ({ items }) => items.map((item, index) => <div key={index}>{item}</div>)',
      'no-array-index-as-key'
    )

    expect(diagnostics.map(({ code }) => code)).toEqual(['react-doctor(no-array-index-as-key)'])
  })

  it('runs React Doctor exit visitors with semantic analysis', () => {
    const diagnostics = lintReactDoctor(
      "import { create } from 'zustand'; const useStore = create((set, get) => ({ count: get().count }))",
      'zustand-no-get-during-initialization'
    )

    expect(diagnostics.map(({ code }) => code)).toEqual([
      'react-doctor(zustand-no-get-during-initialization)'
    ])
  })
})
