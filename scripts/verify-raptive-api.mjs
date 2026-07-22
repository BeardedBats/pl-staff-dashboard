const clientId = process.env.RAPTIVE_CLIENT_ID;
const clientSecret = process.env.RAPTIVE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Raptive verification failed: required environment variables are missing.");
  process.exit(1);
}

const timeout = () => AbortSignal.timeout(15_000);
const tokenResponse = await fetch(
  "https://publisher-api.raptive.com/oauth/token",
  {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: timeout(),
  },
);

if (!tokenResponse.ok) {
  console.error(`Raptive verification failed: token endpoint returned HTTP ${tokenResponse.status}.`);
  process.exit(1);
}

const tokenBody = await tokenResponse.json().catch(() => null);
if (
  !tokenBody ||
  typeof tokenBody.access_token !== "string" ||
  tokenBody.access_token.length === 0 ||
  tokenBody.token_type !== "Bearer" ||
  !Number.isInteger(tokenBody.expires_in) ||
  tokenBody.expires_in <= 0
) {
  console.error("Raptive verification failed: token response did not match the documented contract.");
  process.exit(1);
}

const sitesResponse = await fetch(
  "https://publisher-api.raptive.com/creator-api/v1/sites?page%5Bsize%5D=0",
  {
    headers: { authorization: `Bearer ${tokenBody.access_token}` },
    signal: timeout(),
  },
);
if (!sitesResponse.ok) {
  console.error(`Raptive verification failed: sites endpoint returned HTTP ${sitesResponse.status}.`);
  process.exit(1);
}

const sitesBody = await sitesResponse.json().catch(() => null);
if (
  !sitesBody ||
  !Array.isArray(sitesBody.data) ||
  !sitesBody.meta ||
  sitesBody.data.length !== sitesBody.meta.totalItemCount
) {
  console.error("Raptive verification failed: sites response was incomplete or invalid.");
  process.exit(1);
}

const activeSites = sitesBody.data.filter(
  (site) => site && site.status === "Active" && typeof site.id === "string",
);
let dateBoundsVerified = 0;
for (const site of activeSites) {
  const boundsResponse = await fetch(
    `https://publisher-api.raptive.com/creator-api/v1/sites/${encodeURIComponent(site.id)}/date-bounds`,
    {
      headers: { authorization: `Bearer ${tokenBody.access_token}` },
      signal: timeout(),
    },
  );
  if (!boundsResponse.ok) {
    console.error(`Raptive verification failed: date-bounds endpoint returned HTTP ${boundsResponse.status}.`);
    process.exit(1);
  }
  const bounds = await boundsResponse.json().catch(() => null);
  if (!bounds?.data?.analyticsDateBounds?.range || !bounds?.data?.earningsDateBounds?.range) {
    console.error("Raptive verification failed: date-bounds response did not match the documented contract.");
    process.exit(1);
  }
  dateBoundsVerified += 1;
}

console.log(
  JSON.stringify({
    ok: true,
    authorizedSites: sitesBody.data.length,
    activeSites: activeSites.length,
    dateBoundsVerified,
    tokenLifetimeSeconds: tokenBody.expires_in,
  }),
);
