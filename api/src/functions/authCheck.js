const { app } = require("@azure/functions");
const { authenticateRequest } = require("../lib/auth");

app.http("authCheck", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "auth-check",
    handler: async (request) => {
        const result = await authenticateRequest(request);

        if (!result.ok) {
            return {
                status: result.status,
                jsonBody: {
                    authenticated: false,
                    hiba: result.error,
                    diagnosticCode: result.diagnosticCode || null,
                    diagnosticAlgorithm: result.diagnosticAlgorithm || null,
                    diagnosticKid: result.diagnosticKid || null
                }
            };
        }

        return {
            status: 200,
            jsonBody: {
                authenticated: true,
                tenantId: result.identity.tenantId,
                oid: result.identity.oid,
                profile: result.identity.profile,
                scopes: result.identity.scopes
            }
        };
    }
});
