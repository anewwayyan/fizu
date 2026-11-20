const { app } = require("@azure/functions");
const { authenticateRequest } = require("../lib/auth");

app.http("authCheck", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "auth-check",
    handler: async (request) => {
        const frontendTokenFingerprint = request.headers.get("x-frontend-token-fingerprint") || null;
        const result = await authenticateRequest(request);

        if (!result.ok) {
            return {
                status: result.status,
                jsonBody: {
                    authenticated: false,
                    hiba: result.error,
                    diagnosticCode: result.diagnosticCode || null,
                    diagnosticAlgorithm: result.diagnosticAlgorithm || null,
                    diagnosticKid: result.diagnosticKid || null,
                    diagnosticTokenFingerprint: result.diagnosticTokenFingerprint || null,
                    receivedFrontendTokenFingerprint: frontendTokenFingerprint
                }
            };
        }

        return {
            status: 200,
            jsonBody: {
                authenticated: true,
                receivedFrontendTokenFingerprint: frontendTokenFingerprint,
                tenantId: result.identity.tenantId,
                oid: result.identity.oid,
                profile: result.identity.profile,
                scopes: result.identity.scopes
            }
        };
    }
});
