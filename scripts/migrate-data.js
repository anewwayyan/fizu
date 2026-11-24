const { TableClient } = require("@azure/data-tables");

const connectionString = process.env.MuszakModositasokStorage;

if (!connectionString) {
    throw new Error("Hiányzik a MuszakModositasokStorage környezeti változó.");
}

const tables = [
    { name: "NaptarBejegyzesek", source: "naptar", target: "tamas", expectedSourceCount: 6 },
    { name: "MuszakModositasok", source: "muszak", target: "tamas", expectedSourceCount: 21 },
    { name: "FizetesElozmenyek", source: "fizetes", target: "tamas", expectedSourceCount: 3 }
];

const RESERVED = new Set(["partitionKey", "rowKey", "timestamp", "etag"]);

function propertiesOf(entity) {
    const result = {};
    for (const key of Object.keys(entity).sort()) {
        if (!RESERVED.has(key)) result[key] = entity[key];
    }
    return result;
}

function sameProperties(a, b) {
    return JSON.stringify(propertiesOf(a)) === JSON.stringify(propertiesOf(b));
}

function toTargetEntity(source, partitionKey) {
    return {
        partitionKey,
        rowKey: source.rowKey,
        ...propertiesOf(source)
    };
}

async function readPartition(client, partitionKey) {
    const records = [];
    for await (const entity of client.listEntities({
        queryOptions: { filter: `PartitionKey eq '${partitionKey}'` }
    })) {
        records.push(entity);
    }
    return records;
}

function isKnownOctoberOldValue(entity) {
    return Number(entity.kalkulaltNetto) === 499446 &&
        Number(entity.ledolgozottOra) === 192;
}

async function prepareTable(table) {
    const client = TableClient.fromConnectionString(connectionString, table.name);
    const source = await readPartition(client, table.source);
    const target = await readPartition(client, table.target);

    if (source.length !== table.expectedSourceCount) {
        throw new Error(
            `${table.name}: a forrásrekordok száma ${source.length}, várt: ${table.expectedSourceCount}. Nincs módosítás.`
        );
    }

    const sourceByKey = new Map(source.map(entity => [entity.rowKey, entity]));

    for (const targetEntity of target) {
        const sourceEntity = sourceByKey.get(targetEntity.rowKey);
        if (!sourceEntity) {
            throw new Error(
                `${table.name}: váratlan célrekord: ${targetEntity.rowKey}. Nincs módosítás.`
            );
        }

        if (sameProperties(sourceEntity, targetEntity)) continue;

        const isOctoberConflict =
            table.name === "FizetesElozmenyek" &&
            targetEntity.rowKey === "2026-10" &&
            Number(sourceEntity.kalkulaltNetto) === 593940 &&
            Number(sourceEntity.ledolgozottOra) === 204 &&
            isKnownOctoberOldValue(targetEntity);

        if (!isOctoberConflict) {
            throw new Error(
                `${table.name}: ismeretlen adatütközés: ${targetEntity.rowKey}. Nincs módosítás.`
            );
        }
    }

    return { table, client, source, targetByKey: new Map(target.map(e => [e.rowKey, e])) };
}

async function migratePrepared(prepared) {
    const { table, client, source, targetByKey } = prepared;

    for (const sourceEntity of source) {
        const existing = targetByKey.get(sourceEntity.rowKey);
        if (existing && sameProperties(sourceEntity, existing)) {
            console.log(`Már megfelelő, kihagyva: ${table.name} / ${sourceEntity.rowKey}`);
            continue;
        }

        const targetEntity = toTargetEntity(sourceEntity, table.target);

        if (existing) {
            await client.updateEntity(targetEntity, "Replace", { etag: existing.etag });
            console.log(`Frissítve: ${table.name} / ${sourceEntity.rowKey}`);
        } else {
            await client.createEntity(targetEntity);
            console.log(`Átmásolva: ${table.name} / ${sourceEntity.rowKey}`);
        }
    }
}

async function verifyTable(table) {
    const client = TableClient.fromConnectionString(connectionString, table.name);
    const source = await readPartition(client, table.source);
    const target = await readPartition(client, table.target);

    if (target.length !== source.length) {
        throw new Error(
            `${table.name}: ellenőrzési hiba: cél=${target.length}, forrás=${source.length}.`
        );
    }

    const targetByKey = new Map(target.map(entity => [entity.rowKey, entity]));
    for (const sourceEntity of source) {
        const targetEntity = targetByKey.get(sourceEntity.rowKey);
        if (!targetEntity || !sameProperties(sourceEntity, targetEntity)) {
            throw new Error(
                `${table.name}: az ellenőrzés nem sikerült ennél a rekordnál: ${sourceEntity.rowKey}.`
            );
        }
    }

    console.log(`ELLENŐRIZVE: ${table.name} – ${source.length} rekord egyezik.`);
}

async function main() {
    console.log("MIGRÁCIÓ – ELŐZETES ELLENŐRZÉS");
    const prepared = [];

    // Minden tábla ellenőrzése az első írás előtt.
    for (const table of tables) {
        prepared.push(await prepareTable(table));
    }

    console.log("Minden előfeltétel rendben. Másolás indul; a forrásrekordok megmaradnak.");

    for (const item of prepared) {
        await migratePrepared(item);
    }

    console.log("UTÓELLENŐRZÉS");
    for (const table of tables) {
        await verifyTable(table);
    }

    console.log("SIKER: minden rekord átkerült és egyezik.");
    console.log("A régi forráspartíciók nem lettek törölve.");
}

main().catch(error => {
    console.error("MIGRÁCIÓ MEGSZAKÍTVA:", error.message);
    process.exit(1);
});
