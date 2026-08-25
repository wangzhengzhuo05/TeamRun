import { z } from 'zod'

export const entityIdSchema = z.uuid()
export const timestampSchema = z.iso.datetime({ offset: true })
export const markdownSchema = z.string().max(1_000_000)
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
export const gitObjectIdSchema = z.string().regex(/^[a-f0-9]{40,64}$/i)
export const versionSchema = z.number().int().positive()

export type EntityId = z.infer<typeof entityIdSchema>
