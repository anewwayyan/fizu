# Többfelhasználós átállás – előkészítési terv

## Cél

A Beo + Fizu alkalmazás három külön felhasználót kezeljen: Tamás, Réka és Eni. Mindenki kizárólag a saját műszak-, naptár- és fizetési adatait olvashassa és módosíthassa.

A fejlesztés a `feature/multi-user-prep` ágon történik. A `main` ág és a jelenleg működő alkalmazás maradjon érintetlen az ellenőrzött tesztelésig.

## Jelenlegi állapot

- Azure Table Storage táblák: `MuszakModositasok`, `NaptarBejegyzesek`, `FizetesElozmenyek`.
- A jelenlegi rekordok közös PartitionKey-ket használnak (műszak: `muszak`, naptár: `naptar`, fizetés: `fizetes`).
- A jelenlegi API-végpontok nem végeznek felhasználóhoz kötött adatszintű jogosultság-ellenőrzést.
- A frontend jelenleg `owner` szerepkör alapján korlátoz bizonyos funkciókat; ez nem helyettesíti a szerveroldali felhasználó- és adatelkülönítést.
- A jelenlegi bérparaméterek a frontendben rögzítettek, ezért felhasználónkénti konfigurációra lesz szükség.

## Tervezett célmodell

- Belső profilok: `tamas`, `reka`, `eni`.
- A Table Storage PartitionKey értékét a backend határozza meg az ellenőrzött bejelentkezési identitás alapján.
- A kliens nem küldhet szabadon felhasználóazonosítót vagy PartitionKey-t, amely alapján másik profil adatai elérhetők.
- A RowKey továbbra is a dátumot vagy hónapot azonosítja.
- A bér- és műszakparaméterek külön, felhasználónkénti konfigurációban legyenek tárolva/kezelve.

## Hitelesítés és jogosultság

A tervezett bejelentkezés Microsoft Entra External ID e-mailes egyszer használatos kóddal (OTP). A hitelesítés pontos frontend-integrációját és az Azure-konfigurációt külön lépésben kell kialakítani; jelen dokumentum nem kapcsol be és nem konfigurál Entra-hitelesítést.

A backendnek minden védett kérésnél ellenőriznie kell a hozzáférési token aláírását, issuerét, audience-ét és lejáratát. A hitelesített, stabil felhasználói azonosítót szerveroldali engedélyezési listán kell a belső profilhoz rendelni. A frontendben lévő `isOwner`, illetve a kérésből érkező felhasználóazonosító önmagában nem tekinthető biztonsági határnak.

## Adatmigráció – kötelező biztonsági sorrend

1. A jelenlegi három tábla adatainak mentése.
2. A meglévő rekordok és darabszámok felmérése.
3. A Tamáshoz tartozó meglévő rekordok áthelyezése a `tamas` PartitionKey alá.
4. Az új adatok visszaolvasásával és darabszám-ellenőrzéssel a migráció igazolása.
5. A régi rekordok törlése csak sikeres ellenőrzés és külön jóváhagyás után.

A migrációt éles adatokon először nem szabad destruktív módon futtatni. Legyen visszaállítási lehetőség.

## Javasolt megvalósítási szakaszok

1. Előkészítés: jelenlegi API-k, frontend és telepítési workflow teljes áttekintése.
2. Felhasználói profil- és jogosultsági modell megtervezése.
3. Backend tokenellenőrzés és szerveroldali adatszűrés kialakítása.
4. Táblák PartitionKey-alapú elkülönítése és ellenőrzött migráció.
5. Frontend auth-folyamat átalakítása: először bejelentkezés/profil, utána saját adatok betöltése.
6. Felhasználónkénti bérparaméterek és műszakciklusok kialakítása.
7. Tamás, Réka és Eni elkülönített hozzáférésének tesztelése.
8. Csak sikeres tesztek után pull request és külön jóváhagyott merge a `main` ágra.

## Minimális biztonsági tesztek

- Bejelentkezés nélkül védett adatok nem olvashatók és nem módosíthatók.
- Tamás tokenjével csak a `tamas` profil adatai érhetők el.
- Réka tokenjével csak a `reka` profil adatai érhetők el.
- Eni tokenjével csak az `eni` profil adatai érhetők el.
- A kliens által küldött másik felhasználóazonosító vagy PartitionKey nem változtatja meg a szerver által kiválasztott profilt.
- A GET, POST és DELETE műveletek mind ugyanazt a szerveroldali jogosultsági szabályt követik.
- A meglévő Tamás-adatok a migráció után hiánytalanul megmaradnak.

## Fontos korlát

Ez a dokumentum kizárólag tervezési alap. Nem módosítja az API-kat, az adatbázist, az autentikációt vagy az éles alkalmazás működését.
