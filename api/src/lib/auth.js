const { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } = require("jose");

const TENANT_ID = "86781723-aefe-44af-837b-bc1abdaf1a05";
const ISSUER =
    "https://86781723-aefe-44af-837b-bc1abdaf1a05.ciamlogin.com/86781723-aefe-44af-837b-bc1abdaf1a05/v2.0";
const AUDIENCE = "6b79a267-32cd-42db-a8c9-5971e5afc4a1";
const REQUIRED_SCOPE = "access_as_user";
const JWKS_URI =
    "https://beofizu.ciamlogin.com/86781723-aefe-44af-837b-bc1abdaf1a05/discovery/v2.0/keys";

const JWKS = createRemoteJWKSet(new URL(JWKS_URI));

function getBearerToken(request) {
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

function resolveProfile(oid) {
    const profiles = [
        ["tamas", process.env.ENTRA_TAMAS_OID],
        ["reka", process.env.ENTRA_REKA_OID],
        ["eni", process.env.ENTRA_ENI_OID]
    ];

    const matches = profiles.filter(([, configuredOid]) =>
        configuredOid && configuredOid === oid
    );

    // Fail closed if the same Entra object ID was configured more than once.
    if (matches.length !== 1) {
        return null;
    }

    return matches[0][0];
}

async function authenticateRequest(request) {
    const token = getBearerToken(request);

    if (!token) {
        return {
            ok: false,
            status: 401,
            error: "Hiányzó Bearer access token."
        };
    }

    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: ISSUER,
            audience: AUDIENCE,
            algorithms: ["RS256"]
        });

        if (payload.tid !== TENANT_ID) {
            return {
                ok: false,
                status: 401,
                error: "A token nem a várt tenantből származik."
            };
        }

        if (payload.ver !== "2.0") {
            return {
                ok: false,
                status: 401,
                error: "Nem támogatott tokenverzió."
            };
        }

        if (
            typeof payload.scp !== "string" ||
            !payload.scp.split(" ").includes(REQUIRED_SCOPE)
        ) {
            return {
                ok: false,
                status: 403,
                error: "A token nem tartalmazza a szükséges API-jogosultságot."
            };
        }

        if (typeof payload.oid !== "string" || !payload.oid) {
            return {
                ok: false,
                status: 401,
                error: "A tokenből hiányzik a felhasználói objektumazonosító."
            };
        }

        return {
            ok: true,
            identity: {
                tenantId: payload.tid,
                oid: payload.oid,
                subject: typeof payload.sub === "string" ? payload.sub : null,
                profile: resolveProfile(payload.oid),
                scopes: payload.scp.split(" ")
            }
        };
    } catch (error) {
        // Do not return token contents or cryptographic details to the client.
        console.warn("API token validation failed:", error.code || error.name);
        return {
            ok: false,
            status: 401,
            error: "Érvénytelen vagy lejárt access token.",
            diagnosticCode: error.code || error.name || "UNKNOWN_ERROR",
            diagnosticAlgorithm: (() => {
                try {
                    return decodeProtectedHeader(token).alg || null;
                } catch {
                    return null;
                }
            })(),
            diagnosticKid: (() => {
                try {
                    return decodeProtectedHeader(token).kid || null;
                } catch {
                    return null;
                }
            })()
        };
    }
}

module.exports = { authenticateRequest };
