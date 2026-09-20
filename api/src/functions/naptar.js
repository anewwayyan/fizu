const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");

const TABLA_NEV = "NaptarBejegyzesek";

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
// GET /api/naptar
// Összes naptárbejegyzés lekérése
// =====================================

app.http("naptarGet", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "naptar",

    handler: async () => {

        try {

            const client = getTableClient();

            const bejegyzesek = {};

            for await (const entity of client.listEntities()) {

                bejegyzesek[entity.rowKey] = {
                    cim: entity.cim || "",
                    megjegyzes: entity.megjegyzes || "",
                    ido: entity.ido || ""
                };
            }

            return {
                status: 200,
                jsonBody: bejegyzesek
            };

        } catch (error) {

            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    hiba: "Nem sikerült lekérni a naptárbejegyzéseket."
                }
            };
        }
    }
});


// =====================================
// POST /api/naptar
// Bejegyzés létrehozása / módosítása
// =====================================

app.http("naptarPost", {
    methods: ["POST"],
    authLevel: "anonymous",
    route: "naptar",

    handler: async (request) => {

        try {

            const body = await request.json();

            const datum = body.datum;
            const cim = body.cim;
            const megjegyzes = body.megjegyzes || "";
            const ido = body.ido || "";

            if (!datum || !cim) {

                return {
                    status: 400,
                    jsonBody: {
                        hiba: "Hiányzik a dátum vagy a cím."
                    }
                };
            }

            const client = getTableClient();

            await client.upsertEntity(
                {
                    partitionKey: "naptar",
                    rowKey: datum,
                    cim: cim,
                    megjegyzes: megjegyzes,
                    ido: ido
                },
                "Replace"
            );

            return {
                status: 200,
                jsonBody: {
                    siker: true,
                    datum: datum,
                    cim: cim,
                    megjegyzes: megjegyzes,
                    ido: ido
                }
            };

        } catch (error) {

            console.error(error);

            return {
                status: 500,
                jsonBody: {
                    hiba: "Nem sikerült elmenteni a naptárbejegyzést."
                }
            };
        }
    }
});


// =====================================
// DELETE /api/naptar?datum=2026-09-20
// Bejegyzés törlése
// =====================================

app.http("naptarDelete", {
    methods: ["DELETE"],
    authLevel: "anonymous",
    route: "naptar",

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
                    "naptar",
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
                    hiba: "Nem sikerült törölni a naptárbejegyzést."
                }
            };
        }
    }
});
