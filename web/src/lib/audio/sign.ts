import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AudioEnv } from "./env";

/** 12 hours: long enough for a day's listening, short enough that a revoked token dies the same day. */
export const SIGNED_URL_TTL_S = 12 * 3600;

const clients = new Map<string, S3Client>();

function client(env: AudioEnv): S3Client {
  const id = `${env.accountId}:${env.accessKeyId}`;
  let c = clients.get(id);
  if (!c) {
    c = new S3Client({
      region: "auto",
      // Path style (account host, bucket in the path): one host for every bucket, and the URL shape the tests pin.
      forcePathStyle: true,
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
    });
    clients.set(id, c);
  }
  return c;
}

/** A presigned GET for one object. Signing is local HMAC (SigV4); nothing is sent to R2. */
export function signAudioUrl(r2Key: string, env: AudioEnv, now = new Date()): Promise<string> {
  return getSignedUrl(client(env), new GetObjectCommand({ Bucket: env.bucket, Key: r2Key }), {
    expiresIn: SIGNED_URL_TTL_S,
    signingDate: now,
  });
}
