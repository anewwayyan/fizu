const { app } = require("@azure/functions");
const {
    TableClient,
    TableServiceClient
} = require("@azure/data-tables");

const { authenticateRequest } = require("../lib/auth");

const TABLA_NEV = "FizetesElozmenyek";

function resolveReadProfile(request, ownProfile) {
    const requestedProfile = request.query.get("profile");

    if (!requestedProfile || requestedProfile === ownProfile) {
        return { ok: true, profile: ownProfile };
    }

    // Only Tamás may read another profile. The identity comes from the
    // verified Entra token, never from a client-supplied role.
    if (ownProfile !== "tamas") {
        return {
            ok: false,
            status: 403,
            error: "Nincs jogosultság másik profil adatainak megtekintéséhez."
        };
    }

    if (!["tamas", "reka", "eni"].includes(requestedProfile)) {
        return {
            ok: false,
            status: 400,
            error: "Érvénytelen profil."
        };
    }

    return { ok: true, profile: requestedProfile };
}

function getConnectionString() {

    const connectionString =
        process.env.MuszakModositasokStorage;

    if (!connectionString) {
        throw new Error(
            "Hiányzik a MuszakModositasokStorage környezeti változó."
        );
    }

    return connectionString;
}

async function getTableClient() {

    const connectionString =
        getConnectionString();

    const serviceClient =
        TableServiceClient.fromConnectionString(
            connectionString
        );

    try {
        await serviceClient.createTable(TABLA_NEV);
    } catch (error) {
        // 409 = a tábla már létezik.
        if (error.statusCode !== 409) {
            throw error;
        }
    }

    return TableClient.fromConnectionString(
        connectionString,
        TABLA_NEV
    );
}

app.http("fizetesekGet", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "fizetesek",

    handler: async (request) => {
        const auth = await authenticateRequest(request);
        if (!auth.ok) {
            return { status: auth.status, jsonBody: { hiba: auth.error } };
        }
        const readAccess = resolveReadProfile(request, auth.identity.profile);
        if (!readAccess.ok) {
            return { status: readAccess.status, jsonBody: { hiba: readAccess.error } };
        }
        const profile = readAccess.profile;

        try {

            const client =
                await getTableClient();

            const eredmeny = {};

            for await (
                const entity of client.listEntities({
                    queryOptions: {
                        filter:
                            "PartitionKey eq '" + profile + "'"
                    }
                })
            ) {

                eredmeny[entity.rowKey] = {
                    kalkulaltNetto:
                        Number(
                            entity.kalkulaltNetto || 0
                        ),
                    ledolgozottOra:
                        Number(
                            entity.ledolgozottOra || 0
                        ),
                    mentve:
                        entity.mentve || ""
                };
            }

            return {
                status: 200,
                jsonBody: eredmeny
            };

        } catch (error) {

            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    hiba:
                        "Nem sikerült lekérni a fizetéselőzményeket."
                }
            };
        }
    }
});

app.http("fizetesekPost", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "fizetesek",

    handler: async (request) => {
        const auth = await authenticateRequest(request);
        if (!auth.ok) {
            return { status: auth.status, jsonBody: { hiba: auth.error } };
        }
        const profile = auth.identity.profile;

        try {

            const body =
                await request.json();

            const honap =
                String(body.honap || "");

            const kalkulaltNetto =
                Number(body.kalkulaltNetto);

            const ledolgozottOra =
                Number(body.ledolgozottOra);

            if (
                !/^\d{4}-\d{2}$/.test(honap) ||
                !Number.isFinite(kalkulaltNetto) ||
                !Number.isFinite(ledolgozottOra)
            ) {
                return {
                    status: 400,
                    jsonBody: {
                        hiba:
                            "Érvénytelen fizetési előzmény."
                    }
                };
            }

            const client =
                await getTableClient();

            // Már elmentett hónapot nem írunk felül.
            try {

                const letezo =
                    await client.getEntity(
                        profile,
                        honap
                    );

                return {
                    status: 200,
                    jsonBody: {
                        siker: true,
                        marLetezik: true,
                        adat: {
                            kalkulaltNetto:
                                Number(
                                    letezo.kalkulaltNetto || 0
                                ),
                            ledolgozottOra:
                                Number(
                                    letezo.ledolgozottOra || 0
                                ),
                            mentve:
                                letezo.mentve || ""
                        }
                    }
                };

            } catch (error) {

                if (error.statusCode !== 404) {
                    throw error;
                }
            }

            const mentve =
                new Date().toISOString();

            await client.createEntity({
                partitionKey: profile,
                rowKey: honap,
                kalkulaltNetto:
                    Math.round(kalkulaltNetto),
                ledolgozottOra:
                    ledolgozottOra,
                mentve:
                    mentve
            });

            return {
                status: 200,
                jsonBody: {
                    siker: true,
                    marLetezik: false,
                    adat: {
                        kalkulaltNetto:
                            Math.round(
                                kalkulaltNetto
                            ),
                        ledolgozottOra:
                            ledolgozottOra,
                        mentve:
                            mentve
                    }
                }
            };

        } catch (error) {

            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    hiba:
                        "Nem sikerült elmenteni a fizetéselőzményt."
                }
            };
        }
    }
});
