import "server-only";

// The read-only R2 token the app signs with. Four variables, none NEXT_PUBLIC_. When any is
// missing the lesson page shows no Listen button rather than an error, so a deploy without them is
// a deploy without audio, not a broken one.
export type AudioEnv = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function audioEnv(): AudioEnv | null {
  const accountId = process.env.AUDIO_R2_ACCOUNT_ID;
  const accessKeyId = process.env.AUDIO_R2_READ_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AUDIO_R2_READ_SECRET_ACCESS_KEY;
  const bucket = process.env.AUDIO_R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export const audioEnabled = () => audioEnv() !== null;
