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

A tenant és az API-scope már konfigurálva van. A tényleges OIDC metadata alapján rögzített értékek:\n\n- Tenant ID: `86781723-aefe-44af-837b-bc1abdaf1a05`\n- Primary domain: `beofizu.onmicrosoft.com`\n- User flow: `BeoFizu-SignUpSignIn`\n- SPA client ID: `d36934be-a868-45b7-a097-9c31a2f5505e`\n- API client ID / várható audience: `6b79a267-32cd-42db-a8c9-5971e5afc4a1`\n- API scope: `api://6b79a267-32cd-42db-a8c9-5971e5afc4a1/access_as_user`\n- Authority alap: `https://beofizu.ciamlogin.com/`\n- MSAL authority: `https://beofizu.ciamlogin.com/86781723-aefe-44af-837b-bc1abdaf1a05`\n- Issuer (a metadata pontos értéke): `https://86781723-aefe-44af-837b-bc1abdaf1a05.ciamlogin.com/86781723-aefe-44af-837b-bc1abdaf1a05/v2.0`\n- Authorization endpoint: `https://beofizu.ciamlogin.com/86781723-aefe-44af-837b-bc1abdaf1a05/oauth2/v2.0/authorize`\n- Token endpoint: `https://beofizu.ciamlogin.com/86781723-aefe-44af-837b-bc1abdaf1a05/oauth2/v2.0/token`\n- JWKS URI: `https://beofizu.ciamlogin.com/86781723-aefe-44af-837b-bc1abdaf1a05/discovery/v2.0/keys`\n\nAz issuer hostneve eltér az authority hostnevétől. Ezért MSAL `knownAuthorities` listájában mindkét host szerepeljen: `beofizu.ciamlogin.com` és `86781723-aefe-44af-837b-bc1abdaf1a05.ciamlogin.com`. A pontos API audience és a stabil felhasználói claim nevét az első tényleges API access tokenből kell megerősíteni; a client ID önmagában nem bizonyítja a token `aud` értékét.

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

## Elkülönített MSAL diagnosztikai oldal\n\nA `/auth-test.html` különálló próbaoldal, amely MSAL Browserrel beléptet és az `access_as_user` scope-ra kér access tokent. Nem hívja a jelenlegi API-végpontokat, nem olvas és nem módosít Table Storage-adatot. A token teljes értékét nem jeleníti meg; csak a dekódolt claim-eket mutatja diagnosztikai céllal.\n\nA teszt előtt az Entra `BeoFizu-Web` alkalmazás SPA Redirect URI listájához hozzá kell adni a preview címet `https://jolly-plant-07e0f0310-1.centralus.5.azurestaticapps.net/auth-test.html`, és később – az élesítés előtt – a `https://www.beoesfizu.nl/auth-test.html` címet is. A diagnosztikai oldal nem helyettesíti a backend tokenellenőrzést.\n\n## Jelen dokumentum hatóköre

Ez tervezési dokumentum. Nem módosítja az alkalmazás futó kódját, az Azure-konfigurációt, a Table Storage tartalmát vagy a hitelesítési beállításokat.


## Ellenőrzött tokenadatok és első backend próba

A 2026-11-20-i MSAL diagnosztikai teszt során a tényleges access tokenben az alábbi értékek igazolódtak:

- `ver`: `2.0`
- `tid`: `86781723-aefe-44af-837b-bc1abdaf1a05`
- `aud`: `6b79a267-32cd-42db-a8c9-5971e5afc4a1`
- `iss`: `https://86781723-aefe-44af-837b-bc1abdaf1a05.ciamlogin.com/86781723-aefe-44af-837b-bc1abdaf1a05/v2.0`
- `scp` tartalmazza az `access_as_user` értéket.
- `oid`: Tamás jelenlegi tesztfiókjának objektumazonosítója `4405cee3-414b-4987-b559-40ba48cff6d2`.

Az ID token `aud` értéke a SPA Client ID, ez elvárt. A backend kizárólag az API access token `aud` értékét ellenőrzi.

A feature branchen elkészült az első közös JWT-ellenőrző modul: `api/src/lib/auth.js`. A modul `jose` segítségével ellenőrzi az RS256 aláírást a tenant JWKS kulcsaival, a pontos issuert, az API audience-et, a token időbeli érvényességét, a tenant ID-t, a v2 tokenverziót és a szükséges scope-ot. A `tid` + `oid` alapján történő belső profil-hozzárendelés szerveroldali környezeti változókból történik:

- `ENTRA_TAMAS_OID`
- `ENTRA_REKA_OID`
- `ENTRA_ENI_OID`

Az azonosítók hiánya vagy ütközése esetén nincs profil-hozzárendelés.

Létrejött a `GET /api/auth-check` diagnosztikai végpont, amely még nem olvas és nem módosít üzleti adatot. Az `auth-test.html` az API-token megszerzése után Bearer tokennel meghívja ezt a végpontot. Ez külön ellenőrzi, hogy a backend is érvényesnek fogadja-e el a tokent. A diagnosztikai végpont nem helyettesíti a későbbi üzleti végpontok profil-allowlist ellenőrzését.

A profilazonosítókat az Azure Static Web Apps API alkalmazásbeállításai között kell konfigurálni; a Tamás-azonosító már ismert, Réka és Eni azonosítója a saját első belépésük után adható hozzá.