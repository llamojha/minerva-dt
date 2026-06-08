// Mint a classic dt0c01 access token scoped for OTLP trace ingest, using dtctl's auth.
// Run:  dtctl exec function -f gen/mint-ingest-token.js --plain
// Then copy result.token into .env as DT_INGEST_TOKEN.
import { accessTokensApiTokensClient } from '@dynatrace-sdk/client-classic-environment-v2';

export default async function () {
  const res = await accessTokensApiTokensClient.createApiToken({
    body: {
      name: 'minerva-otlp-ingest',
      scopes: ['openTelemetryTrace.ingest'],
    },
  });
  return { id: res.id, token: res.token };
}
