const { app } = require("@azure/functions");
const {
    TableClient,
    TableServiceClient
} = require("@azure/data-tables");

const { authenticateRequest } = require("../lib/auth");

const TABLA_NEV = "FizetesElozmenyek";


function isValidMonthKey(value) {
    if (typeof value !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) {
        return false;
    }
    const year = Number(value.slice(0, 4));
    return year >= 1;
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
        const profile = auth.identity.profile;
        if (profile !== "tamas") {
            return { status: 403, jsonBody: { hiba: "A bérszámítás ezen a profilon nincs bekapcsolva." } };
        }
        const requestedProfile = request.query.get("profile");
        if (requestedProfile && requestedProfile !== profile) {
            return {
                status: 403,
                jsonBody: { hiba: "Másik profil fizetési adatai nem tekinthetők meg." }
            };
        }

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
        if (profile !== "tamas") {
            return { status: 403, jsonBody: { hiba: "A bérszámítás ezen a profilon nincs bekapcsolva." } };
        }

        try {

            let body;
            try {
                body = await request.json();
            } catch (_) {
                return { status: 400, jsonBody: { hiba: "Hibás JSON-kérés." } };
            }

            if (!body || typeof body !== "object" || Array.isArray(body)) {
                return { status: 400, jsonBody: { hiba: "Érvénytelen kérésadat." } };
            }

            const honap =
                String(body.honap || "");

            const kalkulaltNetto =
                Number(body.kalkulaltNetto);

            const ledolgozottOra =
                Number(body.ledolgozottOra);

            if (
                !isValidMonthKey(honap) ||
                !Number.isFinite(kalkulaltNetto) ||
                kalkulaltNetto < 0 ||
                kalkulaltNetto > 10000000 ||
                !Number.isFinite(ledolgozottOra) ||
                ledolgozottOra < 0 ||
                ledolgozottOra > 744
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
