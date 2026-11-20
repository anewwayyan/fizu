const { app } = require("@azure/functions");
const { authenticateRequest } = require("../lib/auth");

// Returns only the caller's verified Entra object ID.
// This endpoint deliberately does not assign an application profile
// and does not expose or access any business data.
app.http("identityCheck", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "identity-check",
    handler: async (request) => {
        const result = await authenticateRequest(request, {
            allowUnmappedProfile: true
        });

        if (!result.ok) {
            return {
                status: result.status,
                jsonBody: {
                    authenticated: false,
                    hiba: result.error
                }
            };
        }

        return {
            status: 200,
            jsonBody: {
                authenticated: true,
                tenantId: result.identity.tenantId,
                oid: result.identity.oid,
                scopes: result.identity.scopes
            }
        };
    }
});
