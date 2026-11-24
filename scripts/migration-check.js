
const { TableClient } = require("@azure/data-tables");

const connectionString =
    process.env.MuszakModositasokStorage;

if (!connectionString) {
    console.error(
        "Hiányzik a MuszakModositasokStorage környezeti változó."
    );
    process.exit(1);
}

const tables = [
    {
        name: "NaptarBejegyzesek",
        source: "naptar",
        target: "tamas"
    },
    {
        name: "MuszakModositasok",
        source: "muszak",
        target: "tamas"
    },
    {
        name: "FizetesElozmenyek",
        source: "fizetes",
        target: "tamas"
    }
];

async function readPartition(client, partitionKey) {
    const records = [];

    for await (const entity of client.listEntities({
        queryOptions: {
            filter: `PartitionKey eq '${partitionKey}'`
        }
    })) {
        records.push(entity);
    }

    return records;
}

async function checkTable(table) {
    const client = TableClient.fromConnectionString(
        connectionString,
        table.name
    );

    const sourceRecords = await readPartition(
        client,
        table.source
    );

    const targetRecords = await readPartition(
        client,
        table.target
    );

    const targetKeys = new Set(
        targetRecords.map(entity => entity.rowKey)
    );

    const collisions = sourceRecords.filter(
        entity => targetKeys.has(entity.rowKey)
    );

    const safe = sourceRecords.filter(
        entity => !targetKeys.has(entity.rowKey)
    );

    console.log("\n====================================");
    console.log(`Tábla: ${table.name}`);
    console.log(`Forrás: ${table.source}`);
    console.log(`Cél: ${table.target}`);
    console.log("====================================");

    console.log(
        `Forrásrekordok: ${sourceRecords.length}`
    );

    console.log(
        `Célpartíció rekordjai: ${targetRecords.length}`
    );

    console.log(
        `Ütközés nélküli rekordok: ${safe.length}`
    );

    console.log(
        `Kulcsütközések: ${collisions.length}`
    );

    if (safe.length > 0) {
        console.log("\nÜtközés nélkül áthelyezhető RowKey-k:");

        safe.forEach(entity => {
            console.log(`  ${entity.rowKey}`);
        });
    }

    if (collisions.length > 0) {
        console.log("\nÜtköző RowKey-k:");

        collisions.forEach(entity => {
            const target = targetRecords.find(
                item => item.rowKey === entity.rowKey
            );

            console.log(`  ${entity.rowKey}`);

            if (table.name === "FizetesElozmenyek") {
                console.log(
                    "    FORRÁS:",
                    {
                        kalkulaltNetto: entity.kalkulaltNetto,
                        ledolgozottOra: entity.ledolgozottOra
                    }
                );

                console.log(
                    "    CÉL:",
                    {
                        kalkulaltNetto: target.kalkulaltNetto,
                        ledolgozottOra: target.ledolgozottOra
                    }
                );
            }
        });
    }

    return {
        table: table.name,
        sourceCount: sourceRecords.length,
        targetCount: targetRecords.length,
        safeCount: safe.length,
        collisionCount: collisions.length
    };
}

async function main() {
    console.log(
        "MIGRÁCIÓS ELLENŐRZÉS – CSAK OLVASÁS"
    );

    const results = [];

    for (const table of tables) {
        results.push(await checkTable(table));
    }

    console.log("\n\n========= ÖSSZESÍTÉS =========");

    results.forEach(result => {
        console.log(
            `${result.table}: ` +
            `forrás=${result.sourceCount}, ` +
            `cél=${result.targetCount}, ` +
            `ütközés nélküli=${result.safeCount}, ` +
            `ütközés=${result.collisionCount}`
        );
    });

    console.log("\nAz ellenőrzés befejeződött.");
    console.log("Azure-adat módosítása nem történt.");
}

main().catch(error => {
    console.error("Ellenőrzési hiba:", error.message);
    process.exit(1);
});
