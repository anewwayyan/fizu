# Hitelesítési és jogosultsági terv

## Cél

A Beo + Fizu API minden kérésnél megbízhatóan azonosítsa a bejelentkezett személyt, és kizárólag az adott személy adatait engedje olvasni vagy módosítani. A böngészőben futó JavaScript nem lehet jogosultsági döntés forrása.

## Javasolt hitelesítési folyamat

1. A felhasználó a frontendről a Microsoft Entra External ID felhasználói folyamatába kerül.
2. A felhasználó e-mail-címére küldött egyszer használatos kóddal (OTP) hitelesít.
3. A frontend az MSAL Browser segítségével megszerzi az API számára kiállított access tokent.
4. Minden API-kérés az `Authorization: Bearer <token>` fejlécben küldi a tokent.
5. Az API közös hitelesítési segédfüggvénye ellenőrzi a tokent, majd a hitelesített identitást belső profilhoz rendeli.
6. Az adatkezelő végpontok a profilt kizárólag ebből a szerveroldali eredményből veszik.

A konkrét Entra tenant, user flow, issuer, API audience és scope értékek még nincsenek konfigurálva. Ezeket nem szabad kitalálni vagy kódban véglegesíteni a tenant beállítása előtt.

## Tokenellenőrzési követelmények

A backend csak olyan tokent fogadhat el, amelynél ellenőrzött:

- a kriptográfiai aláírás a megfelelő Entra OpenID Connect metadata/JWKS alapján;
- az issuer pontosan a saját External ID tenant és user flow által kiadott érték;
- az audience az alkalmazás saját API-azonosítója;
- a token még érvényes (`exp`), és a `nbf` feltétel is teljesül;
- a token a várt API scope-ot tartalmazza;
- a felhasználói azonosító claim jelen van és stabil.

A token dekódolása önmagában nem hitelesítés. A JWT-t nem szabad pusztán a payload kiolvasásával elfogadni.

A tokenellenőrzést karbantartott JWT/OIDC könyvtárral kell megvalósítani, a JWKS kulcsok biztonságos lekérésével és gyorsítótárazásával. A pontos claim-nevek és issuer-formátum a tényleges External ID konfigurációból lesz rögzítve.

## Belső profil-hozzárendelés

A hitelesített Entra identitásokat szerveroldali engedélyezési lista rendeli belső profilhoz:

| Belső profil | Felhasználó |
|---|---|
| `tamas` | Tamás Entra objektumazonosítója |
| `reka` | Réka Entra objektumazonosítója |
| `eni` | Eni Entra objektumazonosítója |

A tényleges objektumazonosítókat csak a tenant létrehozása és a felhasználók meghívása/regisztrációja után szabad rögzíteni. E-mail-cím önmagában ne legyen tartós elsődleges azonosító, mert változhat.

Ismeretlen, letiltott vagy nem engedélyezett identitás esetén az API `403 Forbidden` választ adjon. Hiányzó vagy érvénytelen token esetén `401 Unauthorized` választ adjon.

## API-végpontok viselkedése

A jelenlegi útvonalak megtarthatók:

- `GET /api/muszakok`: csak a hitelesített profil műszakmódosításai.
- `POST /api/muszakok`: csak a hitelesített profil műszakmódosítását írja.
- `DELETE /api/muszakok?datum=...`: csak a hitelesített profil módosítását törli.
- `GET /api/naptar`: csak a hitelesített profil naptárbejegyzései.
- `POST /api/naptar`: csak a hitelesített profil naptárába ír.
- `DELETE /api/naptar?datum=...`: csak a hitelesített profil bejegyzését törli.
- `GET /api/fizetesek`: csak a hitelesített profil fizetéselőzményei.
- `POST /api/fizetesek`: csak a hitelesített profil fizetéselőzményét menti.

A kliens sem `userId`, sem `profile`, sem `PartitionKey` mezővel nem választhat profilt. Ha ilyen mező érkezik, a backend figyelmen kívül hagyja vagy elutasítja; soha nem használja jogosultság meghatározására.

## Table Storage adatmodell

A meglévő táblák megtarthatók. A cél PartitionKey-k:

- `MuszakModositasok`: `tamas`, `reka`, `eni`
- `NaptarBejegyzesek`: `tamas`, `reka`, `eni`
- `FizetesElozmenyek`: `tamas`, `reka`, `eni`

A RowKey marad dátum (`YYYY-MM-DD`) vagy hónap (`YYYY-MM`). A backend minden lekérdezésnél a hitelesített profil PartitionKey-jére szűr, írásnál pedig azt állítja be.

## Azure Static Web Apps és Functions

A jelenlegi `staticwebapp.config.json` `owner` szerepkörre és anonymous GET útvonalakra épül. Ez a modell nem képes a három felhasználó közötti adatszintű elkülönítésre.

A végleges megoldásnál az API minden védett végpontja ugyanazt a backend tokenellenőrzést használja. Az `authLevel: "anonymous"` önmagában nem jelent nyilvános adathozzáférést, ha a handler minden kérésnél kötelezően ellenőrzi a Bearer tokent; ugyanakkor a SWA útvonal-konfigurációt is hozzá kell igazítani, hogy ne legyen félrevezető vagy ütköző platformoldali védelem.

A jelenlegi SWA Free csomag és az External ID/MSAL együttműködésének pontos lehetőségeit a tenant létrehozásakor és egy izolált próbaalkalmazásban kell ellenőrizni. Nem szabad arra építeni, hogy a SWA beépített `/.auth/login/aad` folyamata automatikusan External ID OTP-t fog használni.

## Frontend változtatások – későbbi szakasz

- Az alkalmazás indulásakor először a hitelesítési állapotot kell megállapítani.
- Érvényes token és profil nélkül védett API-adat nem tölthető be.
- Az API-hívások közös fetch-segédfüggvénye csatolja az access tokent.
- A frontend a saját profilhoz tartozó konfigurációt kérje le, és abból számoljon.
- A frontendben lévő profilváltó vagy módosított kérés nem adhat hozzáférést másik profilhoz.
- A kijelentkezés törölje a kliensoldali hitelesítési állapotot és állítsa alaphelyzetbe a védett adatokat.

## Bevezetési sorrend és biztonság

1. Entra External ID tenant, OTP user flow, API registration és scope konfigurálása.
2. Három tesztidentitás létrehozása és stabil object ID-k rögzítése.
3. Tokenellenőrzés megvalósítása külön, még adatot nem módosító tesztvégponton.
4. 401/403 és hibás token tesztek.
5. Közös backend auth helper bevezetése a feature branchen.
6. A meglévő végpontok átalakítása úgy, hogy minden művelet a hitelesített profil PartitionKey-jét használja.
7. Adatmigráció mentésből, először ellenőrző/dry-run módban.
8. Frontend MSAL-integráció és saját profil betöltése.
9. Három külön felhasználóval teljes izolációs teszt.
10. Csak külön jóváhagyás után pull request és merge.

## Nyitott döntések – konfiguráció után

- External ID tenant és user flow pontos issuer URL-je.
- API audience / Application ID URI és scope.
- A tokenben használt stabil felhasználói claim pontos neve.
- A SWA Free csomaggal együtt használt hosting/auth megoldás véglegesítése.
- A bérparaméterek és műszakciklusok tárolása: külön konfigurációs tábla vagy kezdetben szerveroldali konfiguráció.

## Jelen dokumentum hatóköre

Ez tervezési dokumentum. Nem módosítja az alkalmazás futó kódját, az Azure-konfigurációt, a Table Storage tartalmát vagy a hitelesítési beállításokat.
