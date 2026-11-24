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
                    hiba: result.error
                }
            };
        }

        // The SPA only needs the verified profile to initialize its own session.
        // Do not expose tenant, object ID, scopes, or token diagnostics to the browser.
        return {
            status: 200,
            jsonBody: {
                authenticated: true,
                profile: result.identity.profile
            }
        };
    }
});
