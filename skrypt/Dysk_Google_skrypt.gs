/**
 * Pracownia Fotoksiążki — zapis gotowych plików na Twój Dysk Google, wybór zdjęć ze Zdjęć Google,
 * link na 24 godziny i aktualizacje bez komputera (wersja 5 skryptu). Działa na Twoim koncie Google, bez opłat.
 * Każda aplikacja zapisuje do swojego podfolderu (Ramki, Okładka, Odbitki, Generator obrazów…).
 *
 * Wersja 5 = wersja 4 + aktualizuje się sama: raz dziennie sprawdza na GitHubie (karolmla/pracownia-kod, folder
 * „skrypt”), czy jest nowsza wersja, i sama ją instaluje (adres skryptu się nie zmienia, dostajesz wiadomość).
 * Twój kod dostępu i adres e-mail są tylko tutaj — na GitHubie w ich miejscu są znaczniki.
 * Wersja, która potrzebowałaby nowych zgód Google, nie zainstaluje się sama — dostaniesz wiadomość.
 *
 * INSTALACJA WERSJI 5 (ostatni raz przy komputerze; ok. 7 minut): 0_INSTRUKCJA, rozdział „Skrypt Google w wersji 5”.
 */

var NAZWA_FOLDERU = 'Pracownia Fotoksiążki';
var KOD_DOSTEPU = '__KOD_DOSTEPU__';   // ten sam kod jest w starterze (var DYSK=…); możesz go zmienić
var WERSJA_SKRYPTU = 5;
var MAKS_ROZMIAR = 2 * 1024 * 1024 * 1024;   // największy plik: 2 GB
var ADRES_SESJI = /^https:\/\/([a-z0-9-]+\.)*googleapis\.com\/upload\/drive\/v3\/files\?/;   // tylko wysyłka na Dysk Google
var NAZWA_PODFOLDERU = /^[A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż ._-]{1,40}$/;

/* Aktualizacje bez komputera */
var AKTUALIZUJ_SAM = true;   // false = skrypt nie aktualizuje się sam
var AKTUALIZACJE = 'https://raw.githubusercontent.com/karolmla/pracownia-kod/main/skrypt/';

/* Link na 24 godziny */
var FOLDER_24H = 'Na 24 godziny';    // podfolder w folderze „Pracownia Fotoksiążki”
var MAIL_24H = '__MAIL_24H__';    // tu przychodzą wiadomości; pusty = adres konta Google, na którym działa skrypt
var GODZINY_24H = 24;                // po tylu godzinach plik znika z Dysku
var CO_ILE_MINUT_24H = 15;           // co ile minut skrypt sprawdza, czy coś trzeba usunąć (1, 5, 10, 15 albo 30)
var DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

/* Zdjęcia Google (Google Photos Picker API) */
var ZDJECIA_API = 'https://photospicker.googleapis.com/v1/';
var CZESC_ZDJECIA = 6 * 1024 * 1024;   // zdjęcie wraca do Pracowni w częściach po 6 MB
var ZDJECIA_WPROST = /^image\/(jpeg|jpg|pjpeg|png|gif|webp|bmp)$/i;   // te formaty przeglądarka otworzy — idą jako oryginał
var PAMIEC_ZDJEC = 3600;   // sekundy: tyle Google trzyma ważne linki do wybranych zdjęć

function doGet() {
  return wynik({ ok: true, app: 'pracownia-dysk', wersja: WERSJA_SKRYPTU });
}

function doPost(e) {
  try {
    var z = JSON.parse(e.postData.contents);
    if (!KOD_DOSTEPU || /^__/.test(KOD_DOSTEPU)) return wynik({ ok: false, error: 'skrypt nie ma kodu dostępu (KOD_DOSTEPU)' });
    if (z.kod !== KOD_DOSTEPU) return wynik({ ok: false, error: 'zły kod dostępu' });
    if (z.akcja === 'test' || z.akcja === 'start') zapasowe24();
    if (z.akcja === 'test') {
      folder();
      var l24 = stan24();
      return wynik({ ok: true, folder: NAZWA_FOLDERU, wersja: WERSJA_SKRYPTU, podfoldery: true, zdjecia: true, link24: l24.ok, link24Blad: l24.ok ? '' : l24.error });
    }
    if (z.akcja === 'start') return wynik(start(z));
    if (z.akcja === 'czesc') return wynik(czesc(z));
    if (z.akcja === 'stan') return wynik(stan(z));
    if (z.akcja === 'zdjecia_test') return wynik(zdjeciaTest());
    if (z.akcja === 'zdjecia_start') return wynik(zdjeciaStart(z));
    if (z.akcja === 'zdjecia_stan') return wynik(zdjeciaStan(z));
    if (z.akcja === 'zdjecia_lista') return wynik(zdjeciaLista(z));
    if (z.akcja === 'zdjecia_pobierz') return wynik(zdjeciaPobierz(z));
    if (z.akcja === 'zdjecia_koniec') return wynik(zdjeciaKoniec(z));
    return wynik({ ok: false, error: 'nieznana akcja' });
  } catch (err) {
    return wynik({ ok: false, error: String((err && err.message) || err) });
  }
}

/* Otwiera na Dysku „sesję wysyłania” dla jednego pliku (pozwala wysłać nawet bardzo duży PDF w częściach). */
function start(z) {
  var rozmiar = Number(z.rozmiar);
  if (!(rozmiar > 0 && rozmiar <= MAKS_ROZMIAR)) return { ok: false, error: 'nieprawidłowy rozmiar pliku' };
  var opis = { name: String(z.nazwa || 'plik').slice(0, 200) };
  if (z.na24) {
    var l24 = stan24();   // bez poczty i bez włączonego usuwania plik na 24 godziny w ogóle nie powstaje
    if (!l24.ok) return { ok: false, error: 'link na 24 godziny nie jest gotowy — ' + l24.error };
    var zapas = Date.now() + (GODZINY_24H + 6) * 3600000;   // termin zapasowy; właściwy (24 godziny) ustawia się, gdy plik dotrze
    opis.parents = [folder(FOLDER_24H)];
    opis.properties = { pracownia24: '1', pracownia24do: String(zapas), pracownia24app: podfolderOk(z.podfolder) };
    termin24(zapas, false);
  } else {
    opis.parents = [folder(z.podfolder)];
  }
  var r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=' + (z.na24 ? encodeURIComponent(POLA_24H) : 'id,name,webViewLink'), {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': z.typ || 'application/octet-stream',
      'X-Upload-Content-Length': String(rozmiar)
    },
    payload: JSON.stringify(opis),
    muteHttpExceptions: true,
    followRedirects: false
  });
  var h = r.getAllHeaders();
  var sesja = h['Location'] || h['location'];
  if (r.getResponseCode() !== 200 || !sesja) {
    return { ok: false, error: 'Dysk nie przyjął pliku (' + r.getResponseCode() + ') ' + r.getContentText().slice(0, 200) };
  }
  return { ok: true, sesja: sesja };
}

/* Dosyła jedną część pliku (Pracownia wysyła części po 5 MB). */
function czesc(z) {
  if (!ADRES_SESJI.test(String(z.sesja))) return { ok: false, error: 'nieprawidłowa sesja wysyłania' };
  var bajty = Utilities.base64Decode(z.dane);
  var od = Number(z.od);
  var r = UrlFetchApp.fetch(z.sesja, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: { 'Content-Range': 'bytes ' + od + '-' + (od + bajty.length - 1) + '/' + z.rozmiar },
    payload: bajty,
    muteHttpExceptions: true,
    followRedirects: false
  });
  return odpowiedz(r, z);
}

/* Po zerwanym połączeniu: pyta Dysk, ile bajtów już dotarło, żeby wysyłać dalej od tego miejsca. */
function stan(z) {
  if (!ADRES_SESJI.test(String(z.sesja))) return { ok: false, error: 'nieprawidłowa sesja wysyłania' };
  var r = UrlFetchApp.fetch(z.sesja, {
    method: 'put',
    headers: { 'Content-Range': 'bytes */' + z.rozmiar },
    payload: '',
    muteHttpExceptions: true,
    followRedirects: false
  });
  return odpowiedz(r, z);
}

function odpowiedz(r, z) {
  var kod = r.getResponseCode();
  if (kod === 308) {
    var h = r.getAllHeaders(), zakres = h['Range'] || h['range'] || '';
    var m = /bytes=0-(\d+)/.exec(zakres);
    return { ok: true, gotowe: false, odebrano: m ? Number(m[1]) + 1 : 0 };
  }
  if (kod === 200 || kod === 201) {
    var f = JSON.parse(r.getContentText());
    var out = { ok: true, gotowe: true, id: f.id, nazwa: f.name, folder: sciezka(z.podfolder), link: linkPodgladu(f) };
    if (z.na24) {
      if (!f.properties) f = plikZDysku(f.id) || f;
      if (f.properties && f.properties.pracownia24 === '1') {
        var g = gotowe24(f);
        out.na24 = true; out.folder = sciezka(FOLDER_24H); out.pobierz = linkPobrania(f.id);
        out.usuniecie = g.usuniecie; out.mail = g.mail; out.mailBlad = g.mailBlad;
      }
    }
    return out;
  }
  return { ok: false, error: 'błąd Dysku (' + kod + ') ' + r.getContentText().slice(0, 200) };
}

/* Folder „Pracownia Fotoksiążki”, a w nim — gdy aplikacja poda nazwę — jej podfolder (np. „Ramki”). */
function folder(podfolder) {
  var p = PropertiesService.getScriptProperties();
  var glowny = znajdz(p, 'folder', null, NAZWA_FOLDERU);
  var pod = podfolderOk(podfolder);
  return pod ? znajdz(p, 'folder:' + pod, glowny, pod) : glowny;
}

function znajdz(p, klucz, rodzic, nazwa) {
  var id = p.getProperty(klucz);
  if (id) {
    try { if (!DriveApp.getFolderById(id).isTrashed()) return id; } catch (e) {}
  }
  var gdzie = rodzic ? DriveApp.getFolderById(rodzic) : null;
  var it = gdzie ? gdzie.getFoldersByName(nazwa) : DriveApp.getFoldersByName(nazwa);
  var f = it.hasNext() ? it.next() : (gdzie ? gdzie.createFolder(nazwa) : DriveApp.createFolder(nazwa));
  p.setProperty(klucz, f.getId());
  return f.getId();
}

function podfolderOk(n) {
  n = String(n || '').trim();
  return NAZWA_PODFOLDERU.test(n) ? n : '';
}

function sciezka(podfolder) {
  var pod = podfolderOk(podfolder);
  return pod ? NAZWA_FOLDERU + '/' + pod : NAZWA_FOLDERU;
}

/* ===================== Zdjęcia Google =====================
   Pracownia prosi o „sesję wyboru”, Ty zaznaczasz zdjęcia w oknie Zdjęć Google, a skrypt pobiera tylko
   zaznaczone zdjęcia i oddaje je Pracowni w częściach. Adresy zdjęć zna tylko skrypt (dostaje je od Google),
   więc skrypt nie pobierze niczego spoza Twojego wyboru. */

function zdjeciaApi(metoda, sciezkaApi, cialo) {
  var opcje = { method: metoda, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (cialo) { opcje.contentType = 'application/json; charset=UTF-8'; opcje.payload = JSON.stringify(cialo); }
  var r = UrlFetchApp.fetch(ZDJECIA_API + sciezkaApi, opcje);
  var kod = r.getResponseCode(), tekst = r.getContentText(), j = {};
  try { j = tekst ? JSON.parse(tekst) : {}; } catch (e) { j = {}; }
  if (kod >= 200 && kod < 300) return j;
  throw new Error(bladZdjec(kod, j, tekst));
}

/* Błędy Google po polsku — z tym, co trzeba zrobić. */
function bladZdjec(kod, j, tekst) {
  var e = (j && j.error) || {}, msg = String(e.message || tekst || '').slice(0, 300), st = String(e.status || '');
  var calosc = msg + ' ' + st + ' ' + JSON.stringify(e.details || '');
  if (/SERVICE_DISABLED|has not been used|is disabled|accessNotConfigured/i.test(calosc))
    return 'w projekcie Google Cloud tego skryptu nie jest włączone „Photos Picker API” — włącz je (0_INSTRUKCJA, krok 3, punkt A2)';
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient.*scope|insufficientPermissions/i.test(calosc))
    return 'skrypt nie ma jeszcze zgody na Zdjęcia Google — w edytorze skryptu uruchom funkcję „sprawdz” i zezwól, a potem wdróż nową wersję (0_INSTRUKCJA, krok 3, punkty B4 i B5)';
  if (/FAILED_PRECONDITION/.test(st) && /account/i.test(msg))
    return 'to konto Google nie ma Zdjęć Google (Google: ' + msg + ')';
  if (/FAILED_PRECONDITION/.test(st)) return 'wybór zdjęć jeszcze trwa';
  if (kod === 404) return 'ten wybór zdjęć już wygasł — wybierz zdjęcia jeszcze raz';
  if (kod === 429) return 'Google chwilowo ogranicza liczbę zapytań — spróbuj za minutę';
  return 'Zdjęcia Google odpowiedziały błędem ' + kod + (msg ? ': ' + msg : '');
}

function sekundy(d) { var s = parseFloat(String(d || '')); return isFinite(s) && s >= 0 ? s : null; }
function sesjaOk(s) { return typeof s === 'string' && s.length > 0 && s.length <= 300 && !/[\/?#\s]/.test(s); }

/* Nowa sesja wyboru. ile = 1 (jedno zdjęcie) albo 0 (dowolnie wiele, Google pozwala na 2000). */
function zdjeciaStart(z) {
  var ile = Math.floor(Number(z.ile) || 0), cialo = {};
  if (ile > 0) cialo.pickingConfig = { maxItemCount: String(Math.min(ile, 2000)) };
  var s = zdjeciaApi('post', 'sessions', cialo);
  var p = s.pollingConfig || {};
  return { ok: true, sesja: s.id, adres: s.pickerUri, co: sekundy(p.pollInterval), limit: sekundy(p.timeoutIn), wygasa: s.expireTime || '' };
}

/* Czy już wybrano zdjęcia? */
function zdjeciaStan(z) {
  if (!sesjaOk(z.sesja)) return { ok: false, error: 'nieprawidłowa sesja wyboru zdjęć' };
  var s = zdjeciaApi('get', 'sessions/' + encodeURIComponent(z.sesja));
  var p = s.pollingConfig || {};
  return { ok: true, gotowe: !!s.mediaItemsSet, co: sekundy(p.pollInterval), limit: sekundy(p.timeoutIn) };
}

/* Lista wybranych zdjęć (bez samych plików). Adresy plików zostają w pamięci skryptu na godzinę. */
function zdjeciaLista(z) {
  if (!sesjaOk(z.sesja)) return { ok: false, error: 'nieprawidłowa sesja wyboru zdjęć' };
  var lista = [], token = '', strony = 0, pamiec = {};
  do {
    var j = zdjeciaApi('get', 'mediaItems?sessionId=' + encodeURIComponent(z.sesja) + '&pageSize=100' +
                              (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    (j.mediaItems || []).forEach(function (m) {
      var f = m.mediaFile || {}, md = f.mediaFileMetadata || {};
      var poz = { id: String(m.id || ''), rodzaj: m.type || '', czas: m.createTime || '', nazwa: f.filename || '',
                  typ: f.mimeType || '', w: Number(md.width) || 0, h: Number(md.height) || 0 };
      if (!poz.id) return;
      lista.push(poz);
      if (f.baseUrl) pamiec[kluczZdjecia(z.sesja, poz.id)] = JSON.stringify({ u: f.baseUrl, t: poz.typ, w: poz.w, h: poz.h });
    });
    token = j.nextPageToken || '';
  } while (token && ++strony < 30);
  zapamietaj(pamiec);
  return { ok: true, pozycje: lista };
}

/* Jedna część jednego zdjęcia. JPEG, PNG, WebP, GIF: oryginał (z danymi EXIF — Google usuwa tylko miejsce).
   HEIC i inne formaty, których przeglądarka nie otworzy: JPEG w pełnej rozdzielczości, a do tego data
   i godzina zrobienia zdjęcia odczytane z oryginału (Pracownia wpisze je do pliku JPEG). */
function zdjeciaPobierz(z) {
  if (!sesjaOk(z.sesja) || !z.id) return { ok: false, error: 'nieprawidłowe zdjęcie' };
  var poz = znajdzZdjecie(z.sesja, String(z.id));
  if (!poz) return { ok: false, error: 'nie ma takiego zdjęcia w tym wyborze — wybierz zdjęcia jeszcze raz' };
  var wprost = ZDJECIA_WPROST.test(poz.t || '');
  var bok = function (x) { x = Math.round(Number(x) || 0); return x > 0 ? Math.min(x, 16383) : 16383; };
  var r = pobierzZdjecie(poz.u + (wprost ? '=d' : '=w' + bok(poz.w) + '-h' + bok(poz.h)));
  var bajty = r.getContent();
  var od = Math.max(0, Math.floor(Number(z.od) || 0));
  var ile = Math.min(CZESC_ZDJECIA, Math.max(1, Math.floor(Number(z.ile) || CZESC_ZDJECIA)));
  var typ = (naglowek(r, 'Content-Type').split(';')[0] || '').trim() || (wprost ? poz.t : 'image/jpeg');
  var calosc = od === 0 && bajty.length <= ile;   // zwykle całe zdjęcie mieści się w jednej części
  var out = { ok: true, od: od, rozmiar: bajty.length, typ: typ, przerobione: !wprost,
              suma: calosc ? '' : hex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bajty)),   // przy kilku częściach: czy to ten sam plik
              dane: Utilities.base64Encode(calosc ? bajty : bajty.slice(od, od + ile)) };
  if (!wprost && od === 0) {
    try { out.exif = exifZBajtow(pobierzZdjecie(poz.u + '=d').getContent()); } catch (e) { out.exif = null; }
  }
  return out;
}

/* Koniec wyboru: Google kasuje sesję (zdjęcia w Zdjęciach Google zostają, jak były). */
function zdjeciaKoniec(z) {
  if (!sesjaOk(z.sesja)) return { ok: true };
  try { zdjeciaApi('delete', 'sessions/' + encodeURIComponent(z.sesja)); } catch (e) {}
  return { ok: true };
}

/* Sprawdzenie z Pracowni („Sprawdź połączenie”): czy Google pozwala skryptowi otworzyć okno wyboru. */
function zdjeciaTest() {
  var s = zdjeciaApi('post', 'sessions', { pickingConfig: { maxItemCount: '1' } });
  try { zdjeciaApi('delete', 'sessions/' + encodeURIComponent(s.id)); } catch (e) {}
  return { ok: true, zdjecia: true };
}

function pobierzZdjecie(adres) {
  var r = UrlFetchApp.fetch(adres, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  var kod = r.getResponseCode();
  if (kod === 200) return r;
  if (kod === 401 || kod === 403) throw new Error('Zdjęcia Google nie oddały zdjęcia (' + kod + ') — wybór zdjęć jest ważny godzinę; wybierz je jeszcze raz');
  if (kod === 404) throw new Error('tego zdjęcia nie ma już w Zdjęciach Google');
  throw new Error('Zdjęcia Google odpowiedziały błędem ' + kod + ' przy pobieraniu zdjęcia');
}

function naglowek(r, nazwa) {
  var h = r.getHeaders() || {}, n = nazwa.toLowerCase();
  for (var k in h) if (String(k).toLowerCase() === n) return String(h[k]);
  return '';
}

function kluczZdjecia(sesja, id) {
  return 'zdj:' + hex(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(sesja) + '|' + String(id), Utilities.Charset.UTF_8));
}

function hex(b) {
  var s = '';
  for (var i = 0; i < b.length; i++) s += ('0' + (b[i] & 255).toString(16)).slice(-2);
  return s;
}

function zapamietaj(pamiec) {
  var c = CacheService.getScriptCache(), klucze = Object.keys(pamiec);
  for (var i = 0; i < klucze.length; i += 100) {
    var paczka = {};
    klucze.slice(i, i + 100).forEach(function (k) { paczka[k] = pamiec[k]; });
    c.putAll(paczka, PAMIEC_ZDJEC);
  }
}

function znajdzZdjecie(sesja, id) {
  var c = CacheService.getScriptCache(), k = kluczZdjecia(sesja, id), v = c.get(k);
  if (!v) { zdjeciaLista({ sesja: sesja }); v = c.get(k); }   // pamięć skryptu bywa czyszczona wcześniej — pytamy Google jeszcze raz
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}

/* Data i godzina zrobienia zdjęcia z danych EXIF w pliku (także w HEIC: szukamy bloku „Exif” z nagłówkiem TIFF).
   Zwraca { data: 'RRRR:MM:DD GG:MM:SS', strefa: '+02:00' albo '' } albo null. */
function exifZBajtow(b) {
  var n = Math.min(b.length, 16 * 1024 * 1024);
  for (var i = 0; i + 16 < n; i++) {
    if (b[i] !== 69 || b[i + 1] !== 120 || b[i + 2] !== 105 || b[i + 3] !== 102 || b[i + 4] !== 0 || b[i + 5] !== 0) continue;
    var w = czytajTiff(b, i + 6);
    if (w) return w;
  }
  return null;
}

function czytajTiff(b, t) {
  var u8 = function (o) { return o < b.length ? b[o] & 255 : 0; };
  var le = u8(t) === 0x49 && u8(t + 1) === 0x49, be = u8(t) === 0x4D && u8(t + 1) === 0x4D;
  if (!le && !be) return null;
  var u16 = function (o) { return le ? u8(o) | (u8(o + 1) << 8) : (u8(o) << 8) | u8(o + 1); };
  var u32 = function (o) {
    return le ? (u8(o) | (u8(o + 1) << 8) | (u8(o + 2) << 16)) + u8(o + 3) * 16777216
              : u8(o) * 16777216 + ((u8(o + 1) << 16) | (u8(o + 2) << 8) | u8(o + 3));
  };
  if (u16(t + 2) !== 42) return null;
  var tekst = function (e) {
    var ile = u32(e + 4), o = ile > 4 ? t + u32(e + 8) : e + 8, s = '';
    for (var k = 0; k < ile - 1 && k < 64; k++) { var c = u8(o + k); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  var ifd = function (off, chce) {
    var w = {}, p = t + off;
    if (!(off > 0) || p + 2 > b.length) return w;
    var ile = u16(p);
    for (var k = 0; k < ile && k < 500; k++) {
      var e = p + 2 + k * 12;
      if (e + 12 > b.length) break;
      var tag = u16(e), typ = u16(e + 2);
      if (chce.indexOf(tag) < 0) continue;
      if (typ === 2) w[tag] = tekst(e); else if (typ === 4) w[tag] = u32(e + 8);
    }
    return w;
  };
  var i0 = ifd(u32(t + 4), [0x0132, 0x8769]);
  var ex = i0[0x8769] ? ifd(i0[0x8769], [0x9003, 0x9004, 0x9011]) : {};
  var data = ex[0x9003] || ex[0x9004] || i0[0x0132] || '';
  if (!/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(data)) return null;
  var strefa = String(ex[0x9011] || '');
  return { data: data.slice(0, 19), strefa: /^[+-]\d{2}:\d{2}$/.test(strefa) ? strefa : '' };
}

/* Uruchom ręcznie po każdej aktualizacji skryptu (krok „sprawdz”) — nadaje uprawnienia, tworzy folder na Dysku,
   sprawdza Zdjęcia Google i link na 24 godziny. Potem: Wdróż → Zarządzaj wdrożeniami → ołówek → Nowa wersja → Wdróż. */
function sprawdz() {
  var id = folder();
  Logger.log('Folder na Dysku: ' + DriveApp.getFolderById(id).getName());
  try {
    UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    });
    Logger.log('Zapis na Dysk: działa.');
  } catch (e) {
    Logger.log('Zapis na Dysk: NIE działa — w projekcie Google Cloud włącz „Google Drive API” (0_INSTRUKCJA, krok 3, punkt A2), potem uruchom „sprawdz” jeszcze raz. Google: ' + ((e && e.message) || e));
  }
  try {
    zdjeciaTest();
    Logger.log('Zdjęcia Google: działa.');
  } catch (e) {
    Logger.log('Zdjęcia Google: jeszcze nie działa — ' + ((e && e.message) || e));
  }
  try {
    var l24 = stan24();
    if (!l24.ok) throw new Error(l24.error);
    proba24();
    MailApp.sendEmail({ to: l24.mail, name: 'Pracownia Fotoksiążki', subject: 'Pracownia Fotoksiążki: link na 24 godziny działa',
      body: 'To wiadomość próbna ze skryptu Pracowni. Na ten adres będą przychodzić linki do plików wysłanych przyciskiem „Link na 24 h” i potwierdzenia, że plik zniknął z Dysku.' });
    Logger.log('Link na 24 godziny: działa. Plik próbny zapisany i usunięty, wiadomość próbna poszła na ' + l24.mail + ', sprawdzanie co ' + CO_ILE_MINUT_24H + ' minut.');
  } catch (e) {
    Logger.log('Link na 24 godziny: jeszcze nie działa — ' + ((e && e.message) || e));
  }
  try {
    plikiProjektu();
    wyzwalaczAktualizacji();
    var w = JSON.parse(pobierzZGithuba('wersja.json'));
    PropertiesService.getScriptProperties().setProperty('wdrozona', String(WERSJA_SKRYPTU));
    Logger.log('Aktualizacje bez komputera: działają (raz dziennie ok. 4:00; na GitHubie jest wersja ' + w.wersja + ', ta ma ' + WERSJA_SKRYPTU + ').');
  } catch (e) {
    Logger.log('Aktualizacje bez komputera: jeszcze nie działają — ' + ((e && e.message) || e));
  }
}

/* ===================== Link na 24 godziny (od wersji 4) =====================
   Pracownia wysyła plik do podfolderu „Na 24 godziny”. Gdy plik dotrze, skrypt wysyła Ci wiadomość z linkiem,
   a po 24 godzinach sam usuwa plik z Dysku NA STAŁE (nie do kosza) i wysyła drugą wiadomość.
   Skrypt usuwa wyłącznie pliki, które sam oznaczył przy zapisie (znacznik „pracownia24” we właściwościach pliku)
   — niczego innego na Dysku nie rusza. Bez działającej poczty i bez włączonego sprawdzania (wyzwalacz czasowy)
   plik na 24 godziny w ogóle nie powstaje. */

/* Czy wszystko jest gotowe: adres, poczta, sprawdzanie co kilkanaście minut. Tworzy wyzwalacz, gdy go nie ma. */
function stan24() {
  try {
    var adres = adresMail();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres)) return { ok: false, error: 'brak adresu e-mail (MAIL_24H w skrypcie)' };
    if (MailApp.getRemainingDailyQuota() < 2) return { ok: false, error: 'dzienny limit wiadomości Google jest wyczerpany — spróbuj jutro' };
    wyzwalacz24();
    wyzwalaczAktualizacji();
    return { ok: true, mail: adres };
  } catch (e) {
    return { ok: false, error: 'skrypt nie ma jeszcze zgody na wysyłanie wiadomości i pracę w tle — w edytorze skryptu uruchom funkcję „sprawdz”, zezwól, a potem wdróż nową wersję (0_INSTRUKCJA, „Link na 24 godziny”). Google: ' + String((e && e.message) || e).slice(0, 160) };
  }
}

function adresMail() {
  var a = String(MAIL_24H || '').trim();
  if (!a) a = String(Session.getEffectiveUser().getEmail() || '').trim();
  return a;
}

function wyzwalacz24() {
  var jest = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sprzatanie24'; });
  if (!jest) ScriptApp.newTrigger('sprzatanie24').timeBased().everyMinutes(CO_ILE_MINUT_24H).create();
}

function dysk(metoda, adres, cialo) {
  var opcje = { method: metoda, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (cialo) { opcje.contentType = 'application/json; charset=UTF-8'; opcje.payload = JSON.stringify(cialo); }
  return UrlFetchApp.fetch(adres, opcje);
}

var POLA_24H = 'id,name,size,createdTime,trashed,webViewLink,properties';

function plikZDysku(id) {
  var r = dysk('get', DRIVE_API + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(POLA_24H));
  return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
}

function wlasciwosci(id, w) {
  var r = dysk('patch', DRIVE_API + '/' + encodeURIComponent(id) + '?fields=id', { properties: w });
  if (r.getResponseCode() !== 200) throw new Error('Dysk nie zapisał terminu usunięcia (' + r.getResponseCode() + ')');
}

/* Wszystkie pliki oznaczone przez ten skrypt (także te, które sam przeniosłeś do kosza — po terminie znikną na stałe). */
function pliki24() {
  var lista = [], token = '', strony = 0;
  var q = encodeURIComponent("properties has { key='pracownia24' and value='1' }");
  do {
    var r = dysk('get', DRIVE_API + '?q=' + q + '&spaces=drive&pageSize=100&fields=' + encodeURIComponent('nextPageToken,files(' + POLA_24H + ')') +
                        (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    if (r.getResponseCode() !== 200) throw new Error('Dysk nie podał listy plików (' + r.getResponseCode() + ') ' + r.getContentText().slice(0, 160));
    var j = JSON.parse(r.getContentText());
    (j.files || []).forEach(function (f) { lista.push(f); });
    token = j.nextPageToken || '';
  } while (token && ++strony < 20);
  return lista;
}

/* Plik dotarł na Dysk: ustaw termin (24 godziny od teraz) i wyślij wiadomość z linkiem. Wiadomość idzie tylko raz. */
function gotowe24(f) {
  var w = f.properties || {}, doKiedy = Number(w.pracownia24do) || 0, out = { mail: adresMail(), mailBlad: '' };
  if (w.pracownia24mail === 'blad') out.mailBlad = 'wiadomość z linkiem nie została wysłana';
  if (!w.pracownia24mail) {
    doKiedy = Date.now() + GODZINY_24H * 3600000;
    wlasciwosci(f.id, { pracownia24do: String(doKiedy), pracownia24mail: '1' });
    termin24(doKiedy, false);
    try { mailLink(f, doKiedy); }
    catch (e) {
      out.mailBlad = String((e && e.message) || e).slice(0, 200);
      try { wlasciwosci(f.id, { pracownia24mail: 'blad' }); } catch (e2) {}
    }
  }
  out.usuniecie = new Date(doKiedy).toISOString();
  return out;
}

/* Uruchamia się samo co kilkanaście minut (wyzwalacz czasowy): usuwa pliki, którym minął termin. */
function sprzatanie24() {
  var blokada = LockService.getScriptLock();
  if (!blokada.tryLock(5000)) return;
  try {
    var teraz = Date.now(), lista = pliki24(), nastepny = 0;
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i];
      try {
        var w = f.properties || {}, powstal = Date.parse(f.createdTime) || teraz;
        var doKiedy = Number(w.pracownia24do) || (powstal + GODZINY_24H * 3600000);
        if (teraz >= doKiedy) { usun24(f); continue; }
        if (!nastepny || doKiedy < nastepny) nastepny = doKiedy;
        if (!w.pracownia24mail && teraz - powstal > 10 * 60000) {
          /* plik dotarł, ale Pracownia nie odebrała potwierdzenia (np. zerwane połączenie): wiadomość z linkiem idzie teraz */
          var termin = powstal + GODZINY_24H * 3600000;
          wlasciwosci(f.id, { pracownia24do: String(termin), pracownia24mail: '1' });
          try { mailLink(f, termin); } catch (e1) { try { wlasciwosci(f.id, { pracownia24mail: 'blad' }); } catch (e2) {} }
        }
      } catch (e) { blad24(f, e); if (!nastepny || teraz < nastepny) nastepny = teraz; }
    }
    termin24(nastepny, true);
  } finally {
    blokada.releaseLock();
  }
}

/* Najbliższy termin usunięcia (pamięć skryptu). Gdy wyzwalacz czasowy z jakiegoś powodu nie zadziała,
   skrypt posprząta przy okazji dowolnego zapytania z Pracowni (zapasowe24 w doPost). */
function termin24(ms, nadpisz) {
  var p = PropertiesService.getScriptProperties(), bylo = Number(p.getProperty('termin24')) || 0;
  if (!ms) { if (nadpisz) p.deleteProperty('termin24'); return; }
  if (nadpisz || !bylo || ms < bylo) p.setProperty('termin24', String(ms));
}

function zapasowe24() {
  try {
    var t = Number(PropertiesService.getScriptProperties().getProperty('termin24')) || 0;
    if (t && Date.now() > t + 2 * CO_ILE_MINUT_24H * 60000) sprzatanie24();
  } catch (e) {}
}

function usun24(f) {
  var r = dysk('delete', DRIVE_API + '/' + encodeURIComponent(f.id));
  var kod = r.getResponseCode();
  if (kod === 404) return;   // pliku już nie ma
  if (kod !== 204 && kod !== 200) throw new Error('Dysk nie usunął pliku (' + kod + ') ' + r.getContentText().slice(0, 160));
  PropertiesService.getScriptProperties().deleteProperty('blad24:' + f.id);
  if ((f.properties || {}).pracownia24test === '1') return;   // plik próbny z funkcji „sprawdz” — bez wiadomości
  try { mailUsuniety(f); } catch (e) { Logger.log('Plik usunięty, ale wiadomość nie wyszła: ' + ((e && e.message) || e)); }
}

/* Usunięcie się nie udało: skrypt spróbuje ponownie przy następnym sprawdzeniu, a Ty dostaniesz ostrzeżenie (najwyżej raz na 12 godzin). */
function blad24(f, e) {
  var p = PropertiesService.getScriptProperties(), klucz = 'blad24:' + f.id, ostatnio = Number(p.getProperty(klucz)) || 0;
  Logger.log('Link na 24 godziny: „' + f.name + '” — ' + ((e && e.message) || e));
  if (Date.now() - ostatnio < 12 * 3600000) return;
  p.setProperty(klucz, String(Date.now()));
  try {
    MailApp.sendEmail({ to: adresMail(), name: 'Pracownia Fotoksiążki',
      subject: 'Uwaga: nie udało się usunąć pliku z Dysku — ' + f.name,
      body: 'Skrypt Pracowni nie mógł usunąć pliku „' + f.name + '” z folderu „' + sciezka(FOLDER_24H) + '” na Twoim Dysku Google.\n' +
            'Spróbuje ponownie za ' + CO_ILE_MINUT_24H + ' minut. Możesz też usunąć plik ręcznie:\n' + linkPodgladu(f) + '\n\n' +
            'Powód: ' + String((e && e.message) || e).slice(0, 300) });
  } catch (e2) {}
}

function linkPodgladu(f) { return f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view'); }
function linkPobrania(id) { return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id); }
function htmlEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function rozmiarPL(n) {
  n = Number(n) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(n >= 104857600 ? 0 : 1).replace('.', ',') + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}

/* Data po polsku w czasie polskim, np. „czwartek, 12 listopada 2026, 06:45”. */
function kiedyPL(ms) {
  var dni = { Mon: 'poniedziałek', Tue: 'wtorek', Wed: 'środa', Thu: 'czwartek', Fri: 'piątek', Sat: 'sobota', Sun: 'niedziela' };
  var mies = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var c = Utilities.formatDate(new Date(ms), 'Europe/Warsaw', 'EEE|d|M|yyyy|HH:mm').split('|');
  return (dni[c[0]] || c[0]) + ', ' + c[1] + ' ' + (mies[Number(c[2]) - 1] || c[2]) + ' ' + c[3] + ', ' + c[4];
}

function mailLink(f, doKiedy) {
  var nazwa = String(f.name || 'plik'), rozmiar = rozmiarPL(f.size), pobierz = linkPobrania(f.id), podglad = linkPodgladu(f), kiedy = kiedyPL(doKiedy);
  var app = String((f.properties || {}).pracownia24app || '');
  MailApp.sendEmail({
    to: adresMail(), name: 'Pracownia Fotoksiążki',
    subject: 'Link na 24 godziny: ' + nazwa,
    body: 'Plik z Pracowni Fotoksiążki' + (app ? ' (' + app + ')' : '') + ' jest na Twoim Dysku Google.\n\n' +
          'Plik: ' + nazwa + ' (' + rozmiar + ')\n' +
          'Pobierz: ' + pobierz + '\n' +
          'Podgląd na Dysku: ' + podglad + '\n\n' +
          'Link działa po zalogowaniu na Twoje konto Google.\n' +
          'Plik zniknie sam: ' + kiedy + ' (' + GODZINY_24H + ' godziny od zapisu). Dostaniesz wtedy drugą wiadomość.',
    htmlBody: '<div style="font:16px/1.5 Arial,sans-serif;color:#1C201B;max-width:560px">' +
          '<p>Plik z Pracowni Fotoksiążki' + (app ? ' (' + htmlEsc(app) + ')' : '') + ' jest na Twoim Dysku Google.</p>' +
          '<p style="margin:0 0 4px"><b>' + htmlEsc(nazwa) + '</b> (' + rozmiar + ')</p>' +
          '<p style="margin:18px 0"><a href="' + htmlEsc(pobierz) + '" style="display:inline-block;background:#C1401F;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Pobierz plik</a>' +
          ' &nbsp; <a href="' + htmlEsc(podglad) + '" style="color:#C1401F">Podgląd na Dysku</a></p>' +
          '<p>Link działa po zalogowaniu na Twoje konto Google.</p>' +
          '<p>Plik zniknie sam: <b>' + kiedy + '</b> (' + GODZINY_24H + ' godziny od zapisu). Dostaniesz wtedy drugą wiadomość.</p></div>'
  });
}

function mailUsuniety(f) {
  var nazwa = String(f.name || 'plik'), rozmiar = rozmiarPL(f.size), powstal = Date.parse(f.createdTime);
  var kiedy = powstal ? ' Zapisany: ' + kiedyPL(powstal) + '.' : '';
  MailApp.sendEmail({
    to: adresMail(), name: 'Pracownia Fotoksiążki',
    subject: 'Usunięto z Dysku: ' + nazwa,
    body: 'Plik „' + nazwa + '” (' + rozmiar + ') został usunięty z Twojego Dysku Google na stałe — minęły ' + GODZINY_24H + ' godziny od zapisu.' + kiedy + '\n' +
          'Link z poprzedniej wiadomości już nie działa.',
    htmlBody: '<div style="font:16px/1.5 Arial,sans-serif;color:#1C201B;max-width:560px">' +
          '<p>Plik <b>' + htmlEsc(nazwa) + '</b> (' + rozmiar + ') został usunięty z Twojego Dysku Google na stałe — minęły ' + GODZINY_24H + ' godziny od zapisu.' + kiedy + '</p>' +
          '<p>Link z poprzedniej wiadomości już nie działa.</p></div>'
  });
}

/* Próba z funkcji „sprawdz”: mały plik z terminem, który już minął — skrypt musi go znaleźć i usunąć na stałe. */
function proba24() {
  var plik = DriveApp.getFolderById(folder(FOLDER_24H)).createFile('Pracownia - plik próbny (zaraz zniknie).txt', 'Plik próbny Pracowni Fotoksiążki.');
  var id = plik.getId();
  wlasciwosci(id, { pracownia24: '1', pracownia24do: String(Date.now() - 60000), pracownia24mail: '1', pracownia24test: '1' });
  for (var k = 0; k < 6; k++) {   // Dysk potrzebuje czasem kilku sekund, zanim pokaże nowy plik w wyszukiwaniu
    sprzatanie24();
    if (dysk('get', DRIVE_API + '/' + encodeURIComponent(id) + '?fields=id').getResponseCode() === 404) return;
    Utilities.sleep(2500);
  }
  try { plik.setTrashed(true); } catch (e) {}
  throw new Error('plik próbny nie został usunięty — w projekcie Google Cloud sprawdź, czy włączone jest „Google Drive API”');
}

/* ===================== Aktualizuje się sam (od wersji 5) =====================
   Raz dziennie (ok. 4:00) skrypt sprawdza na GitHubie (karolmla/pracownia-kod, folder „skrypt”), czy jest nowsza wersja.
   Jeśli jest: sprawdza sumę kontrolną, wstawia do nowego kodu Twój kod dostępu i adres e-mail (na GitHubie ich nie ma),
   podmienia kod, tworzy nową wersję i przestawia na nią wdrożenie — adres skryptu się nie zmienia. Dostajesz wiadomość.
   Wersja, która potrzebowałaby NOWYCH zgód Google, nie instaluje się sama: dostajesz wiadomość, że trzeba to zrobić
   przy komputerze. Wyłączenie: AKTUALIZUJ_SAM = false. */

function pobierzZGithuba(plik) {
  var r = UrlFetchApp.fetch(AKTUALIZACJE + plik + '?t=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('GitHub nie podał pliku ' + plik + ' (' + r.getResponseCode() + ')');
  return r.getContentText('UTF-8');
}

function sha256(tekst) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tekst, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function skryptApi(metoda, sciezkaApi, cialo) {
  var opcje = { method: metoda, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (cialo) { opcje.contentType = 'application/json; charset=UTF-8'; opcje.payload = JSON.stringify(cialo); }
  var r = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + sciezkaApi, opcje);
  var kod = r.getResponseCode(), t = r.getContentText(), j = {};
  try { j = JSON.parse(t || '{}'); } catch (e) {}
  if (kod >= 200 && kod < 300) return j;
  var m = String((j.error && j.error.message) || t).slice(0, 300);
  if (/has not enabled the Apps Script API/i.test(m))
    throw new Error('Włącz „Google Apps Script API” w ustawieniach: https://script.google.com/home/usersettings (raz, przełącznik „Włączone”).');
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(m))
    throw new Error('W projekcie Google Cloud skryptu włącz „Apps Script API” (to ten sam projekt co dla Zdjęć Google: console.cloud.google.com → „Interfejsy API i usługi” → „Włącz interfejsy API” → Apps Script API → „Włącz”).');
  throw new Error('Apps Script API: ' + kod + ' ' + m);
}

/* Nowy kod z GitHuba + Twoje dane (kod dostępu, adres e-mail). Na GitHubie są w tym miejscu znaczniki. */
function wstawDane(szablon) {
  var zn = '__';   // znaczniki składane z kawałków, żeby nie występowały w tym kodzie dosłownie
  var zamiany = [["var KOD_DOSTEPU = '" + zn + 'KOD_DOSTEPU' + zn + "';", "var KOD_DOSTEPU = '" + KOD_DOSTEPU + "';"],
                 ["var MAIL_24H = '" + zn + 'MAIL_24H' + zn + "';", "var MAIL_24H = '" + MAIL_24H + "';"]];
  if (/['\\\n]/.test(KOD_DOSTEPU + MAIL_24H)) throw new Error('kod dostępu albo adres e-mail ma niedozwolony znak');
  zamiany.forEach(function (z) {
    if (szablon.split(z[0]).length !== 2) throw new Error('nowy kod nie ma miejsca na Twoje dane (' + z[0].slice(4, 15) + ')');
    szablon = szablon.replace(z[0], function () { return z[1]; });
  });
  return szablon;
}

function plikiProjektu() {
  var pliki = (skryptApi('get', '/content').files || []);
  var kod = pliki.filter(function (f) { return f.type === 'SERVER_JS'; }), man = pliki.filter(function (f) { return f.name === 'appsscript'; })[0];
  if (kod.length !== 1 || !man) throw new Error('projekt ma ' + kod.length + ' plików z kodem — aktualizacja automatyczna obsługuje jeden');
  return { kod: kod[0], manifest: man, inne: pliki.filter(function (f) { return f !== kod[0] && f !== man; }) };
}

/* Tworzy wersję z bieżącego kodu i przestawia na nią wdrożenie aplikacji internetowej (adres zostaje ten sam). */
function wdrozBiezacy(opis, wersja) {
  var v = skryptApi('post', '/versions', { description: opis }).versionNumber;
  if (!v) throw new Error('Google nie utworzył nowej wersji');
  var lista = (skryptApi('get', '/deployments').deployments || []).filter(function (d) {
    return d.deploymentConfig && d.deploymentConfig.versionNumber && (d.entryPoints || []).some(function (e) { return e.entryPointType === 'WEB_APP'; });
  });
  if (!lista.length) throw new Error('nie znalazłem wdrożenia aplikacji internetowej');
  lista.forEach(function (d) {
    skryptApi('put', '/deployments/' + encodeURIComponent(d.deploymentId), { deploymentConfig: {
      scriptId: ScriptApp.getScriptId(), versionNumber: v, manifestFileName: 'appsscript', description: opis } });
  });
  PropertiesService.getScriptProperties().setProperty('wdrozona', String(wersja));
  return v;
}

/* Uruchamia się samo raz dziennie (wyzwalacz) — można też ręcznie z edytora. */
function aktualizacja() {
  if (!AKTUALIZUJ_SAM) return 'wyłączone';
  var blokada = LockService.getScriptLock();
  if (!blokada.tryLock(20000)) return 'zajęte';
  var p = PropertiesService.getScriptProperties();
  try {
    /* kod został już podmieniony, ale wdrożenie się nie udało — dokończ */
    var wdrozona = Number(p.getProperty('wdrozona')) || 0;
    if (wdrozona && wdrozona < WERSJA_SKRYPTU) {
      wdrozBiezacy('Pracownia: wersja ' + WERSJA_SKRYPTU + ' (dokończenie aktualizacji)', WERSJA_SKRYPTU);
      mailAktualizacji('Skrypt Pracowni: wersja ' + WERSJA_SKRYPTU + ' działa', 'Dokończyłem aktualizację skryptu Pracowni do wersji ' + WERSJA_SKRYPTU + '. Adres skryptu się nie zmienił — niczego nie musisz robić.');
      return 'dokończono ' + WERSJA_SKRYPTU;
    }
    var info = JSON.parse(pobierzZGithuba('wersja.json'));
    var nowa = Number(info.wersja) || 0;
    if (nowa <= WERSJA_SKRYPTU) { p.deleteProperty('aktBlad'); return 'aktualna ' + WERSJA_SKRYPTU; }
    var szablon = pobierzZGithuba(info.skrypt || 'Dysk_Google_skrypt.gs'), manifest = pobierzZGithuba(info.manifest || 'appsscript.json');
    if (sha256(szablon) !== info.sha256Skrypt || sha256(manifest) !== info.sha256Manifest)
      throw new Error('suma kontrolna nowego kodu się nie zgadza — spróbuję jutro');
    if (szablon.indexOf('var WERSJA_SKRYPTU = ' + nowa + ';') < 0) throw new Error('numer wersji w nowym kodzie się nie zgadza');
    var nowyMan = JSON.parse(manifest), pr = plikiProjektu(), staryMan = JSON.parse(pr.manifest.source);
    var brak = (nowyMan.oauthScopes || []).filter(function (z) { return (staryMan.oauthScopes || []).indexOf(z) < 0; });
    if (brak.length || JSON.stringify(nowyMan.webapp) !== JSON.stringify(staryMan.webapp)) {
      if (p.getProperty('aktZgoda') !== String(nowa)) {
        p.setProperty('aktZgoda', String(nowa));
        mailAktualizacji('Skrypt Pracowni: wersja ' + nowa + ' czeka na Ciebie',
          'Jest nowa wersja skryptu Pracowni (' + nowa + '): ' + (info.opis || '') + '\n\nPotrzebuje nowej zgody Google, więc nie zainstaluje się sama. ' +
          'Przy komputerze zrób kroki z 0_INSTRUKCJA (rozdział „Skrypt Google”). Do tego czasu wszystko działa jak dotąd.');
      }
      return 'czeka na zgodę ' + nowa;
    }
    var kod = wstawDane(szablon);
    skryptApi('put', '/content', { files: pr.inne.concat([
      { name: pr.kod.name, type: 'SERVER_JS', source: kod },
      { name: 'appsscript', type: 'JSON', source: manifest }]) });
    p.setProperty('wdrozona', String(WERSJA_SKRYPTU));   // nowy kod już jest; wdrożenie poniżej (gdyby się nie udało — jutro dokończy go nowy kod)
    wdrozBiezacy('Pracownia: wersja ' + nowa + ' (aktualizacja automatyczna)', nowa);
    p.deleteProperty('aktBlad');
    mailAktualizacji('Skrypt Pracowni zaktualizował się sam: wersja ' + nowa,
      'Skrypt Pracowni na Twoim koncie Google ma teraz wersję ' + nowa + '.\n' + (info.opis ? 'Co nowego: ' + info.opis + '\n' : '') +
      'Adres skryptu, kod dostępu i ustawienia zostały bez zmian — niczego nie musisz robić.');
    return 'zaktualizowano do ' + nowa;
  } catch (e) {
    var m = String((e && e.message) || e), ost = JSON.parse(p.getProperty('aktBlad') || '{}'), teraz = Date.now();
    Logger.log('Aktualizacja: ' + m);
    var od = ost.m === m ? (ost.od || teraz) : teraz, wyslana = ost.m === m ? (ost.t || 0) : 0;
    /* GitHub chwilowo niedostępny — wiadomość dopiero, gdy trwa to 3 dni; inna przeszkoda — od razu; ta sama najwyżej raz na 3 dni */
    var czas = /^GitHub nie podał/.test(m) ? teraz - od >= 3 * 86400000 - 3600000 : true;
    p.setProperty('aktBlad', JSON.stringify({ m: m, od: od, t: wyslana }));
    if (czas && teraz - wyslana > 3 * 86400000 - 3600000) {
      p.setProperty('aktBlad', JSON.stringify({ m: m, od: od, t: teraz }));
      mailAktualizacji('Skrypt Pracowni: aktualizacja się nie udała', 'Skrypt Pracowni nie mógł się dziś zaktualizować. Wszystko działa jak dotąd, spróbuje jutro.\n\nPowód: ' + m);
    }
    return 'błąd: ' + m;
  } finally {
    blokada.releaseLock();
  }
}

function mailAktualizacji(temat, tresc) {
  try { MailApp.sendEmail({ to: adresMail(), name: 'Pracownia Fotoksiążki', subject: temat, body: tresc }); } catch (e) { Logger.log('Wiadomość nie wyszła: ' + ((e && e.message) || e)); }
}

function wyzwalaczAktualizacji() {
  if (!AKTUALIZUJ_SAM) return;
  var jest = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'aktualizacja'; });
  if (!jest) ScriptApp.newTrigger('aktualizacja').timeBased().everyDays(1).atHour(4).create();
}

function wynik(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
