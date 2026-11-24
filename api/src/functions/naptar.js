const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");
const { authenticateRequest } = require("../lib/auth");

const TABLA_NEV = "NaptarBejegyzesek";

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

function isValidDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
}

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

            const client = getTableClient();

            const bejegyzesek = {};

            for await (const entity of client.listEntities({ queryOptions: { filter: "PartitionKey eq '" + profile + "'" } })) {

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
        const auth = await authenticateRequest(request);
        if (!auth.ok) {
            return { status: auth.status, jsonBody: { hiba: auth.error } };
        }
        const profile = auth.identity.profile;

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

            const datum = body.datum;
            const cim = body.cim;
            const megjegyzes = body.megjegyzes === undefined ? "" : body.megjegyzes;
            const ido = body.ido === undefined ? "" : body.ido;

            if (
                !isValidDateKey(datum) ||
                typeof cim !== "string" ||
                !cim.trim() ||
                cim.length > 150 ||
                typeof megjegyzes !== "string" ||
                megjegyzes.length > 2000 ||
                typeof ido !== "string" ||
                (ido !== "" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(ido))
            ) {

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
                    partitionKey: profile,
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
        const auth = await authenticateRequest(request);
        if (!auth.ok) {
            return { status: auth.status, jsonBody: { hiba: auth.error } };
        }
        const profile = auth.identity.profile;

        try {

            const datum =
                request.query.get("datum");

            if (!isValidDateKey(datum)) {

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
                    profile,
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
