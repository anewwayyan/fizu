const { app } = require("@azure/functions");

app.http("authCheck", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "auth-check",
    handler: async (request) => {
        return {
            status: 200,
            jsonBody: {
                diagnostic: "AUTH_CHECK_DIAGNOSTIC_V1",
                handlerReached: true,
                authorizationHeaderPresent: Boolean(
                    request.headers.get("authorization")
                )
            }
        };
    }
});
