const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");

const TABLA_NEV = "MuszakModositasok";

function getTableClient() {
    const connectionString =
        process.env.MuszakModositasokStorage;

    if (!connectionString) {
        throw new Error(
            "Hiányzik a MuszakModositasokStorage környezeti változó."
        );
    }

    return TableClient.fromConnectionString(
        connectionString,
        TABLA_NEV
    );
}


// =====================================
// GET /api/muszakok
// Összes műszakmódosítás lekérése
// =====================================

app.http("muszakokGet", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "muszakok",

    handler: async () => {

        try {

            const client = getTableClient();

            const modositasok = {};

            for await (const entity of client.listEntities()) {
                modositasok[entity.rowKey] = entity.tipus;
            }

            return {
                status: 200,
                jsonBody: modositasok
            };

        } catch (error) {

            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    hiba: "Nem sikerült lekérni a műszakokat."
                }
            };
        }
    }
});


// =====================================
// POST /api/muszakok
// Műszak létrehozása / módosítása
// =====================================

app.http("muszakokPost", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "muszakok",

    handler: async (request) => {

        try {

            const body = await request.json();

            const datum = body.datum;
            const tipus = body.tipus;

            if (!datum || !tipus) {

                return {
                    status: 400,
                    jsonBody: {
                        hiba: "Hiányzik a dátum vagy a műszaktípus."
                    }
                };
            }

            const engedelyezettTipusok = [
                "nappal",
                "ejszaka",
                "szabad",
                "szabi",
                "tsz",
                "nappal_tulora_150",
                "ejszaka_tulora_150",
                "nappal_tulora",
                "ejszaka_tulora"
            ];

            if (!engedelyezettTipusok.includes(tipus)) {

                return {
                    status: 400,
                    jsonBody: {
                        hiba: "Érvénytelen műszaktípus."
                    }
                };
            }

            const client = getTableClient();

            await client.upsertEntity(
                {
                    partitionKey: "muszak",
                    rowKey: datum,
                    tipus: tipus
                },
                "Replace"
            );

            return {
                status: 200,
                jsonBody: {
                    siker: true,
                    datum: datum,
                    tipus: tipus
                }
            };

        } catch (error) {

            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    hiba: "Nem sikerült elmenteni a műszakot."
                }
            };
        }
    }
});


// =====================================
// DELETE /api/muszakok?datum=2026-09-20
// Visszaállítás az alapbeosztásra
// =====================================

app.http("muszakokDelete", {
    methods: ["DELETE"],
    authLevel: "anonymous",
    route: "muszakok",

    handler: async (request) => {

        try {

            const datum =
                request.query.get("datum");

            if (!datum) {

                return {
                    status: 400,
                    jsonBody: {
                        hiba: "Hiányzik a dátum."
                    }
                };
            }

            const client = getTableClient();

            try {

                await client.deleteEntity(
                    "muszak",
                    datum
                );

            } catch (error) {

                if (error.statusCode !== 404) {
                    throw error;
                }
            }

            return {
                status: 200,
                jsonBody: {
                    siker: true
                }
            };

        } catch (error) {

            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    hiba: "Nem sikerült törölni a módosítást."
                }
            };
        }
    }
});
