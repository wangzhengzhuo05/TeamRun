import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { TeamRunServiceConfig } from '../service-config.js'
import { ApiProblem } from '../http/api-problem.js'

export type PublicationUpload = {
  objectKey: string
  uploadUrl: string
  requiredHeaders: Record<string, string>
}

export type PublicationDownload = {
  downloadUrl: string
  expiresAt: string
}

const DOWNLOAD_TTL_SECONDS = 5 * 60

export class PublicationObjectStore {
  readonly #client: S3Client
  readonly #bucket: string

  constructor(config: TeamRunServiceConfig) {
    this.#bucket = config.TEAMRUN_S3_BUCKET
    this.#client = new S3Client({
      endpoint: config.TEAMRUN_S3_ENDPOINT,
      region: config.TEAMRUN_S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.TEAMRUN_S3_ACCESS_KEY_ID,
        secretAccessKey: config.TEAMRUN_S3_SECRET_ACCESS_KEY
      }
    })
  }

  async ensureBucket(allowCreate: boolean): Promise<void> {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }))
    } catch (error) {
      if (!allowCreate) {
        throw error
      }
      await this.#client.send(new CreateBucketCommand({ Bucket: this.#bucket }))
    }
  }

  async prepareUpload(args: {
    publicationId: string
    clientArtifactId: string
    contentType: string
    byteSize: number
    sha256: string
  }): Promise<PublicationUpload> {
    const objectKey = `publications/${args.publicationId}/${encodeURIComponent(args.clientArtifactId)}`
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: objectKey,
      ContentType: args.contentType,
      ContentLength: args.byteSize,
      Metadata: { sha256: args.sha256 }
    })
    return {
      objectKey,
      uploadUrl: await getSignedUrl(this.#client, command, { expiresIn: 15 * 60 }),
      requiredHeaders: {
        'content-type': args.contentType,
        'content-length': String(args.byteSize),
        'x-amz-meta-sha256': args.sha256
      }
    }
  }

  async verifyUpload(args: { objectKey: string; byteSize: number; sha256: string }): Promise<void> {
    try {
      const head = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: args.objectKey })
      )
      if (head.ContentLength !== args.byteSize || head.Metadata?.sha256 !== args.sha256) {
        throw new ApiProblem(
          409,
          'artifact_verification_failed',
          'Uploaded artifact does not match the confirmed size and checksum'
        )
      }
    } catch (error) {
      if (error instanceof ApiProblem) {
        throw error
      }
      throw new ApiProblem(409, 'artifact_upload_missing', 'A confirmed artifact was not uploaded')
    }
  }

  async prepareDownload(objectKey: string, fileName: string): Promise<PublicationDownload> {
    const command = new GetObjectCommand({
      Bucket: this.#bucket,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    })
    return {
      downloadUrl: await getSignedUrl(this.#client, command, { expiresIn: DOWNLOAD_TTL_SECONDS }),
      expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString()
    }
  }
}
