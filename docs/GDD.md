# Northbite — Oyun Tasarım Dokümanı (GDD)

> Sürüm 0.1 · Not: Oyun adında "Idle Tycoon" ifadesi kullanılmayacak (bu ifade bir firmanın tescilli markası).

## 1. Özet
Kutup kıyısında tek bir olta ve bir igloyla başlayan bir balıkçının, küçük bir buz deliğinden kocaman bir liman kasabasına uzanan hikâyesi.

Oyuncu balık tutar, satar, para kazanır ve yeni alanlar açar. Zamanla penguen, fok ve kutup ayısı yardımcılar tutar ve işleri otomatiğe bağlar.

- **Tür:** Arcade-idle (karakter fiziksel olarak dolaşır, istasyonlar zamanla otomatikleşir)
- **Platform:** Mobil, dikey ekran, tek elle oynanır
- **Görsel stil:** Low-poly 3D, düz gölgelendirme (flat shading), pastel ve soğuk palet, sıcak vurgu renkleri
- **Oturum hedefi:** 3–8 dakikalık kısa ve sık oturumlar

## 2. Çekirdek döngü
1. Oyuncu **buz deliğinin** etkileşim halkasında durunca olta otomatik atılır. Balık vurunca kısa bir **balık tutma mini oyunu** oynanır (bkz. §2.1).
2. Tutulan balıklar karakterin **sırtında üst üste yığılır** (taşıma kapasitesi kadar). Yığın karışık **eşya** taşır: çiğ balık ve tütsülenmiş balık (ikisi de tür + kg).
3. Oyuncu **satış tezgâhına** yürür, yükü tezgâha bırakır. Tezgâh iki türü de satar.
4. **Müşteriler** gelir, tezgâhtan rastgele bir eşya alır ve eşyanın değeri kadar **coin** bırakır.
5. Oyuncu coin'lerin üstünden geçerek parayı toplar.
6. Para, yerdeki **kilit alanlarına** harcanır: kesik çizgili çerçevenin üstünde ~0.3 sn durunca para akar, çerçeve dolunca yapı açılır. Bir çerçeve, ön koşulu açılınca zıplayarak belirir.
7. Yeni istasyonlar, işçiler ve yükseltmeler açıldıkça oyuncunun elle yaptığı işler otomatiğe döner. Oyuncu da daha büyük hedeflere yönelir. Oyuncu bütün işleri elle de yapabilir; otomasyon yalnızca yardım eder.

**Ürün zinciri (Demo 3):**
- **Balık ağı** (1. deliğe kurulur): Her 6 sn'de deliğin yanındaki **sepete** bir kapelin ya da morina ekler. Sepet 8 balık alır; dolunca ağ durur ve sepetin üstünde "Dolu" görünür. Sepetin yanından geçen oyuncunun sırtına balıklar uçar. Ağ kurulu delikte oyuncu yine mini oyunla balık tutabilir.
- **Tütsühane:** Giriş rafına (8) çiğ balık bırakılır, her balık 4 sn'de tütsülenip çıkış rafına (8) geçer. Çıkış doluysa durur. Tütsülenmiş balık = aynı balık, koyu turuncu-kahve, hafif buğulu; değeri **çiğ değer × 2.5**.
- **Penguen** sepetten ve tütsühaneden tezgâha taşır (§7).

**Etkileşim kuralı:** İstasyonlarda buton yoktur; etkileşim alanında durmak yeterlidir (türün standardı budur). İstisnalar: balık tutmada vuruşta dokunmak ve sarmak için basılı tutmak; **olta tezgâhındaki yükseltme paneli** (oyundaki ilk butonlu arayüz, §4.2).

## 2.1 Balık tutma mini oyunu
Mini oyunun his ayarları `src/settings.ts` (`FishingFeel`), balık verileri `src/content/fish.ts` içindedir.

**Akış**
1. **Olta atma:** Karakter buz deliğinin etkileşim halkasına girip ~0.3 sn durunca olta otomatik atılır (buton yok). Kol ve olta savrulur, misina yay çizer, şamandıra suya düşer, su halkası oluşur.
2. **Bekleme:** Şamandıra suda hafifçe sallanır, karakter nefes alır. 1.5–4 sn sonra balık vurur.
3. **Vuruş:** Şamandıra batar, su sıçrar, karakterin başında "!" çıkar, kısa titreşim olur. Oyuncunun ekrana dokunmak için **0.8 sn**'si var. Kaçırırsa balık gider, olta yeniden atılır.
4. **Sarma:** Ekranda herhangi bir yere **basılı tutmak** makarayı sarar, bırakmak gevşetir.
   - **İlerleme barı:** Basılı tutunca dolar, bırakınca yavaşça boşalır. Gerilim sarı bölgedeyken daha yavaş, kırmızıdayken çok yavaş dolar.
   - **Gerilim göstergesi:** Basılı tutunca sakin suda yeşil bölgeye yerleşir, bırakınca düşer. Renk bölgeleri yeşil, sarı ve kırmızıdır. Yeşil bölgenin genişliği türe göre değişir.
   - **Çekiş:** Balık periyodik olarak çekiştirir. Önce kısa bir uyarı gelir (olta ucu seğirir, su sıçrar), sonra gerilim ani yükselir, olta ucu eğilir ve balık suda çırpınır. Çekişte basılı tutmaya devam edersen gerilim kırmızıyı aşar.
   - Gerilim tavanı aşarsa **misina kopar**, balık kaçar.
   - İlerleme %100 olunca balık yakalanır.
5. **Yakalama:** Balık sudan yay çizerek fırlar, karakterin önünde çırpınır. Üstünde kısa bir kart görünür: tür adı, kg ve nadirlik rengi. Sonra balık sırttaki yığına uçar. Belirgin bir titreşim olur.
6. **Kaçış:** Misina kopma efekti ve "Kaçtı!" yazısı görünür. Ceza yoktur, olta yeniden atılır.
7. **Yığın dolu:** Kapasite doluysa olta atılmaz; başın üstünde "Dolu!" görünür.
8. **Joystick ile çakışma:** Vuruş ve sarma sırasında dokunuşlar joystick yerine sarmaya gider. Oyuncu parmağını 40 px'den fazla sürüklerse mini oyun iptal olur ve aynı dokunuş joystick'e devredilir (normal yürüyüşe dönülür). Etkileşim halkasından çıkmak veya yürümek de iptal eder.
9. **Okunabilirlik:** Gerilim ve ilerleme göstergesi karakterin yanında, ekranın ortasına yakın durur; alt %30'da parmağın altında kalmaz.

**Balık türleri**

| Tür | Kg | Sarma | Çekiş | Başlangıç olasılığı |
|---|---|---|---|---|
| Kapelin (küçük) | 0.05–0.2 | ~1.25 sn | Neredeyse yok | %65 |
| Kutup morinası (orta) | 0.5–2 | ~3 sn | Ara sıra, hafif | %28 |
| Kutup alabalığı (büyük) | 2–6 | ~5 sn | Sık ve sert | %7 |
| Grönland kalkanı (dev) | 8–20 | ~6 sn | Çok sert, düzensiz | Yalnızca Özel yem seviye 3'ten itibaren |

- Tür içinde kg rastgeledir (küçükler daha sık). Büyük kg, sarma süresini ve çekiş gücünü en fazla %35 artırır.
- **Satış fiyatı** = kg × kg başına fiyat (yuvarlanır, en az 1 coin).
- **İlk yakalama:** Bir tür ilk kez tutulduğunda kart büyür, "Yeni tür!" şeridi taşır ve daha uzun kalır.

## 3. Karakter oluşturma
**Ne zaman açılır**
- Kayıt yoksa (ilk açılış) oyun başlamadan önce açılır. "Başla"ya basılana kadar hiçbir şey kaydedilmez; uygulama kapatılırsa ekran bir sonraki açılışta yine gelir.
- Kayıt varsa doğrudan oyuna girilir. Kayıtta görünüm yoksa (Demo 0–3 oyuncuları) varsayılan görünüm atanır; ekran zorla gösterilmez.
- HUD'daki dişli → Ayarlar → **"Karakteri düzenle"** aynı ekranı açar. "Başla" yerine "Kaydet" yazar, köşede kapatma (×) vardır; ilerleme bozulmaz.

**Ekran düzeni (dikey, tek elle)**
- Üst: "Northbite" yazısı, altında "Karakterini oluştur".
- Orta (~%45): oyundaki karakter modeli hafif yukarıdan, yavaşça dönerek görünür. Arkada soluk kar/buz zemin, gökyüzünde çok hafif kuzey ışığı (yeşil-mor), yavaş kar. Parmakla sürükleyince model döner; bırakınca yumuşakça yavaş dönüşe geçer.
- Alt (~%45): seçenek paneli. En altta "Rastgele" (ikincil, zar ikonu) ve "Başla" (büyük, mont turuncusu). Onların üstünde ikonlu kategori sekmeleri (Ten, Mont, Başlık, Sakal, Atkı, İsim), sekmelerin üstünde seçili sekmenin seçenekleri: renkler için büyük yuvarlak kutular, şekiller için ikonlu kartlar. Tüm dokunma alanları ≥48 px. Güvenli alanlar hesaba katılır.
- Seçim anında modele uygulanır; model kısa bir ölçek zıplaması yapar, küçük bir parıltı çıkar.

**Seçenekler** (`src/content/appearance.ts`; renk değerleri `render/Palette.ts`, etiketler `strings.ts`)
- Ten tonu: 6 (açıktan koyuya)
- Mont rengi: 8 (ilk sırada turuncu #F28C38)
- Başlık: yok, bere, kürk şapka, kukuleta (bere ve kürk şapkanın 6 rengi var; kukuleta mont rengini alır)
- Sakal: yok, kısa, uzun (4 renk)
- Atkı: yok + 8 renk
- İsim: en fazla 12 karakter; boşsa "Balıkçı" / "Angler". Yalnızca yerelde görünür (filtre şimdilik yok).
- **Rastgele:** Uyumlu kombinasyon üretir: mont ve atkı aynı renk olmaz, başlık rengi mont rengiyle aynı olmaz. İsmi değiştirmez.

**"Başla" sonrası giriş sahnesi**
1. Ekran ~400 ms'de solar.
2. Karakter iglonun önünde durur. Kamera uzaktan (geniş açı) başlayıp 1.5 sn'de normal takip mesafesine yaklaşır; kar hafifçe artar.
3. Karakterin başında "Merhaba, {isim}!" balonu çıkar, 2 sn sonra kaybolur.
4. Sonra joystick ve rehber ok devreye girer (giriş sırasında joystick kapalıdır).

**Teknik**
- Model parçalı low-poly. Tüm başlık/sakal/atkı parçaları bir kez üretilir; değişimde yalnızca görünürlük ve materyal rengi değişir (çöp üretilmez). Parçalar `src/models/createPlayerParts.ts` içinde ayrı fonksiyonlar.
- Ekran aynı renderer'ı ayrı bir sahne ve kamerayla kullanır; açıkken oyun sahnesi güncellenmez ve çizilmez. Bütçe ~30 draw call.
- Görünüm save'e `appearance` objesi olarak yazılır (isim dahil; save v3 alanı, bozuk değerler varsayılana döner).
- Oyunda isim etiketi gösterilmez; isim yalnızca selamlama balonunda ve ayarlar panelinde görünür.
- Kasaba halkı (müşteriler) oyuncuya ait olmayan, daha soluk bir renk ve şapka setinden rastgele seçilir; oyuncu kendini kolayca ayırt eder.

**Hassasiyet:** Yerleşim hayalî bir kuzey kasabasıdır. Gerçek yerli halkları stereotip biçimde tasvir eden kıyafet, desen veya isimler kullanılmaz.

## 4. Kontroller
### 4.1 Joystick (yüzen / floating)
- Ekranın alt %70'lik bölümünde herhangi bir yere dokununca joystick **o noktada belirir**.
- Ölçüler:
  - Dış halka: 120 px çap
  - İç top: 52 px çap
  - En fazla sürükleme: 60 px yarıçap
- Ölü bölge %12'dir. Hız analogdur: sürükleme mesafesi arttıkça hız da artar.
- Parmak kalkınca joystick 150 ms içinde solarak kaybolur ve karakter durur.
- **Stil:** Yarı saydam beyaz halka, buz mavisi iç top, hafif parıltı. Belirirken kısa bir ölçek animasyonu oynar.
- Karakter dönerken yumuşak geçiş yapar, ani dönüş olmaz.

### 4.2 Diğer
- Üst bölümde HUD bulunur: coin, (ileride) premium para ve ayarlar.
- Paneller (yükseltme gibi) alttan kayarak açılır.
- **Olta tezgâhı paneli:** İglonun yanındaki tezgâhın turuncu halkasında durunca açılır, uzaklaşınca kapanır. 2×2 büyük kart; her kartta ikon, ad, seviye, etki ("şimdi → sonraki") ve fiyat. Kartın tamamı butondur. Alınca kart zıplar, konfeti saçılır, etki hemen uygulanır; para yetmezse kart sallanır.
- **Titreşim:**
  - Balık eklenince çok kısa bir titreşim
  - Kilit açılınca daha belirgin bir titreşim
  - Web'de `navigator.vibrate` (Android'de çalışır), native'de Capacitor Haptics kullanılır.

## 5. Kamera ve ekran
- Dikey yönde, 9:16 ile 9:20 arası oranlar desteklenir.
- Perspektif kamera, dar görüş açısıyla (FOV ~35°) yukarıdan ve eğik açıyla bakar (izometriğe yakın, ~50°).
- Karakteri yumuşak (lerp) takip eder. Yeni bölge açılınca kısa bir "kamera gezdirme" animasyonu oynar.
- Hafif sis (fog) derinlik hissi verir, gökyüzü renk geçişlidir (gradient).

## 6. Dünya ve bölgeler (aşamalar)
| # | Bölge | Açılan ana içerik | Ürün / gelir | Otomasyon |
|---|---|---|---|---|
| 1 | **Buz Kıyısı** | İglo, 1 buz deliği, satış tezgâhı | Çiğ balık | — |
| 2 | **Tütsühane** | 2. ve 3. delik, tütsü fırını | Tütsülenmiş balık (daha değerli) | Penguen taşıyıcı |
| 3 | **Ahşap İskele** | Tekne, açık su, büyük balıklar | Somon / morina | Fok balıkçı |
| 4 | **Konserve Fabrikası** | Konveyör bant, paketleme | Konserve kasaları | Kutup ayısı forklift |
| 5 | **Kaplıca ve Kuzey Işığı Kampı** | Sıcak su kaynağı, çadırlar, turistler | Konaklama ve yemek geliri | Kamp görevlileri |
| 6 | **Buzkıran Limanı** | Kargo gemisi, ihracat siparişleri | Büyük sipariş ödülleri | Tam otomasyon → yeni ada (prestij) |

Bölgeler 1–2 ilk demolar içindir. 3 ve sonrası tasarım yönünü gösterir, ayrıntılar sonra netleşecek.

**Bölge açma sistemi (veri odaklı, `src/content/zones.ts` → `Regions`):** Her bölge tanımı id, ad, maliyet, ön koşul, engel (buz duvarı dikdörtgeni), içindeki kilit alanları ve kamera gezdirme noktası taşır.
- Açılmamış bölge haritada görünür, ama önünde kalın, yarı saydam, çatlaklı bir **buz duvarı** durur (çarpışmalı). Duvarın önünde kilit alanı vardır.
- Kilit alanı dolunca: duvar sarsılıp çatlar → parçalara ayrılıp saçılır, kar/buz partikülleri uçar, belirgin titreşim ve kamera sarsıntısı olur → çarpışma kalkar → kamera ~0.7 sn'de yeni bölgeye kayar, içindeki kilit alanları zıplayarak belirir, kamera oyuncuya döner. Bu sırada joystick devre dışıdır (toplam ~3.5 sn).

**Buz Kıyısı + Tütsühane bölgesi yerleşimi (Demo 3):** Kuzey ve doğu deniz. Tütsühane bölgesi batıda, bir ağaç kuşağının arkasında; kuşaktaki tek geçit buz duvarıyla kapalı. İçinde tütsühane ve 3. buz deliği kilit alanları var. Penguen kulübesi merkezde (iglonun güneyinde) kalır; batısında Penguen Pazarı tezgâhı vardır (Demo 7B, §24; eski "2. penguen" kilit alanının yerine). Güneydeki ağaç kuşağında ikinci bir buz duvarı durur; Demo 7C'de bu duvar Liman İskelesi'nin tapu duvarı oldu (§25).

Görsel çeşitlilik bölgelere göre artar:
- Beyaz-mavi kıyı
- Turuncu ışıklı tütsühane
- Ahşap tonlu iskele
- Buharlı, yeşil-mor gökyüzülü kaplıca

## 7. İşçiler
| İşçi | Görev | Yükseltmeler |
|---|---|---|
| Penguen | İstasyonlar arası taşıma | Hız, taşıma kapasitesi |
| Fok | Deliklerde ve teknede balık tutma | Tutma hızı |
| Kutup ayısı | Fabrikada ağır yük taşıma | Hız, kapasite |
| Kasaba halkı | Tezgâh ve kamp görevlisi (kasiyer) | Servis hızı |

İşçiler basit bir durum makinesiyle çalışır: `idle → gidiyor → alıyor → gidiyor → bırakıyor`.

**Penguen (Demo 3; Demo 7B'de rollere ayrıldı, §24):**
- "Penguen kulübesi" kilit alanıyla ilk penguen (Taşıyıcı) ücretsiz gelir; diğerleri Penguen Pazarı'ndan alınır.
- Her penguenin bir rolü vardır; ne yapacağını iş panosundan seçer (§24). Yapacak iş yoksa kulübenin önündeki yerinde bekler (ara sıra kanat çırpar, etrafına bakar).
- Taşıma 3, hız 2.6 birim/sn (oyuncu 4.0); özellik ve seviye bunu değiştirir. Değerler `src/content/workers.ts`, `penguins.ts`, `roles.ts`.
- Yol bulma: `zones.ts` içinde waypoint grafiği, A* ile; bazı kenarlar yalnızca ilgili bölge açılınca kullanılır. Yerel kaçınma = statik engellerden itilme. Penguenler oyuncunun ve birbirlerinin içinden geçebilir.
- Birden fazla penguen aynı balıkları hedeflemesin diye iş panosu kaynak ve hedeflerde rezervasyon yapar (§24).
- Görsel: low-poly penguen, iki yana sallanan paytak yürüyüş, sırtında küçük yığın; her penguenin kendi bere ve atkı rengi var. Konumları kaydedilmez; açılışta kulübeden başlarlar (taşıdıkları kaydedilir).

## 8. Ekonomi (Demo 3 değerleri, simülasyonla ayarlandı)
Değerler `src/content/` altında: `economy.ts` (oyuncu, tezgâh, müşteri, açılış fiyatları), `fish.ts`, `stations.ts`, `workers.ts`, `upgrades.ts`. Denge simülasyonu: `npm run sim` (`tools/balance-sim.ts`).

| Değer | Başlangıç |
|---|---|
| Balık tutma | Mini oyun (§2.1); bir balık ortalama ~6–7 sn |
| Oyuncu taşıma kapasitesi | 5 (Sırt çantası ile 10'a kadar) |
| Oyuncu yürüme hızı | 4.0 birim/sn |
| Çiğ balık satış fiyatı | kg × kg başına fiyat: kapelin 15, morina 3, alabalık 2.5, kalkan 2 coin/kg (ortalama ~2.6 coin/balık) |
| Tütsülenmiş balık | Çiğ değer × 2.5 (ortalama ~6.9 coin), tütsüleme 4 sn/balık |
| Tezgâh kapasitesi | 12 eşya |
| Müşteri gelme aralığı | 3–5 sn, her müşteri 1–3 eşya alır |
| Balık ağı | 6 sn'de 1 balık (kapelin/morina), sepet 8 |
| Tütsühane rafları | Giriş 8, çıkış 8 |
| Penguen | Taşıma 3, hız 2.6 birim/sn |

**Açılış fiyatları ve sırası** (her biri bir öncekinden sonra görünür):

| Açılış | Fiyat | Hedef | Simülasyon (medyan) |
|---|---|---|---|
| 2. buz deliği | 25 | ~2 dk | 2:11 |
| Balık ağı | 35 | ~4 dk | 4:01 |
| Penguen kulübesi (1. penguen) | 65 | ~6 dk | 6:32 |
| Buz duvarı → Tütsühane bölgesi | 125 (Demo 4: 140 → 125) | ~10 dk | 10:57 |
| Tütsühane | 150 (Demo 4: 160 → 150) | 12–15 dk | 14:38 |
| 3. buz deliği | 160 (Demo 4: 220 → 160) | ~22 dk | 22:06 |
| Penguen Pazarı tezgâhı (tütsühaneden sonra; Demo 7B, eski "2. penguen" 220'nin yerine) | 40 | ~15 dk | 15:54 |
| 2. penguen (Pazar'dan, Tütsücü ~185) | §24 | ~28 dk | 26:34 |

**Olta yükseltmeleri** (5 seviye, seviye 1 başlangıç; fiyat = `taban × 1.6^(seviye − 1)`):

| Yükseltme | Taban | Etki (Sv1 → Sv5) |
|---|---|---|
| Sağlam misina | 20 | Gerilim tavanı %100 → %180 (çekiş gücü bu orana bölünür) |
| Hızlı makara | 20 | Sarma hızı %100 → %200 |
| Özel yem | 30 | Yaygın olmayan türlerin vuruş ağırlığı ×1 → ×3; Sv3'te Grönland kalkanı havuza girer |
| Sırt çantası | 25 | Taşıma 5 → 6 → 7 → 8 → 10 |

- **Çarpan 1.6:** Tüm yükseltmelerin toplamı ~880 coin; ilk seviyeler ucuz, son seviyeler 20. dakikadan sonraya kalır.
- **İlk 15 dakika hedefi:** İlk dakikada ilk satış, ~2 dk'da ilk kilit açılışı, ~6 dk'da ilk penguen, ~10 dk'da yeni bölge, ~12–15 dk'da tütsühane.
- **Boşta gelir (simülasyon):** Ağ ve 1. penguen açıldıktan sonra 3 dk hiç dokunulmazsa coin yığınına ~70 coin eklenir; tütsühane açıldıktan sonra ~114 coin.
- **Rehber oku:** Her zaman karşılanabilir en ucuz hedefi gösterir; karşılanabilir hedef yoksa en ucuz hedefi. Yerdeki coin ile hedefe yetiyorsa önce coin yığınını gösterir. İlk iki açılıştan sonra, hiç yükseltme alınmamışsa ve biri karşılanabiliyorsa olta tezgâhını bir kez gösterir.
- **Çevrimdışı gelir:**
  - 2. bölgeden sonra açılır.
  - Otomatik istasyonların ürettiğinin %50'si kazanılır.
  - Üst sınır başta 2 saattir, yükseltmelerle 8 saate çıkar.
  - Oyuna dönüşte "sen yokken" penceresi açılır.

## 9. Görsel stil
**Palet** (`render/Palette.ts`):

| Rol | Renk |
|---|---|
| Kar | `#F4F8FB` |
| Buz | `#CFE6F2` |
| Gölge mavisi | `#8FB3C9` |
| Derin su | `#2B6E8F` |
| Mont (vurgu) | `#F28C38` |
| Ahşap | `#8A5A3B` |
| Coin | `#FFD447` |
| Kuzey ışığı yeşil | `#5FF2B0` |
| Kuzey ışığı mor | `#9B6BFF` |

**"Juice" (hissiyat efektleri):**
- Coin toplarken zıplayarak karaktere uçar.
- Kilit açılınca yapı küçükten zıplayarak (bounce) büyür.
- Sırttaki yığın yürürken hafifçe sallanır.
- Buz deliğinde su halkaları oluşur.
- Hafif kar partikülleri yağar.
- Coin sayacı sayarak artar; coin yağarken sayaç kutusu her karede değil, en fazla ~0.25 sn'de bir zıplar.
- Ses, titreşim ve zıplama aynı anda başlar (kilit açılması, yükseltme, yakalama). Bir olay tek titreşim verir (§17.1).

**Modeller:** Önce tamamen kodla üretilir. İleride gerekirse ücretsiz CC0 low-poly paketler (ör. Kenney, Quaternius) veya Blender ile glTF modellerine geçilir.

## 10. Kayıt, ses, gelir modeli
- **Kayıt:**
  - Otomatik olarak her 10 saniyede, kilit açıldığında ve arka plana geçişte yapılır.
  - Save verisinde sürüm numarası tutulur (`saveVersion`) ve ileriye dönük göç (migration) fonksiyonu yer alır.
- **Ses (Demo 6):** Ayrıntılar §21'de.
- **Gelir modeli (son aşamada netleşecek, varsayılan):**
  - Ödüllü reklam: çevrimdışı geliri 2 katına çıkarma, 3 dk 2x hız.
  - Opsiyonel "reklamları kaldır" satın alımı.
  - Oyunu zorla kesen tam ekran reklam yok veya çok az.

## 11. Demo yol haritası
Her demo **telefondan açılabilen bir link** ile biter.

### Demo 0 — His testi
- Buz zemini, su kenarı, kodla üretilmiş karakter, yüzen joystick, takip kamerası, sis, gökyüzü
- **Kabul kriterleri:**
  - Telefonda 60 fps'e yakın akıcı çalışır.
  - Joystick parmağın değdiği yerde belirir.
  - Karakter su ve iglonun içinden geçemez.
  - Pinch-zoom ve sayfa kayması yoktur.

### Demo 1 — Çekirdek döngü
- Balık tutma mini oyunu (§2.1), sırtta yığma, tezgâh, müşteriler, coin toplama, kilit alanı (2. delik)
- **Kabul kriterleri:**
  - Hiç açıklama okumadan 1 dakika içinde ilk satış yapılabilir.
  - Kapelin neredeyse her denemede tutulur. Alabalık dikkat ister, ama çekişte bırakılırsa tutulur.
  - Mini oyun sırasında joystick yanlışlıkla açılmaz; 40 px sürükleme mini oyunu temiz biçimde iptal eder.
  - Telefonda 60 fps korunur.

### Demo 2 — Karakter oluşturma (Demo 3'ten sonra yapıldı)
- Karakter oluşturma ekranı (§3), "Başla" sonrası giriş sahnesi, ayarlar paneli ve "Karakteri düzenle", kasaba halkı için ayrı renk seti
- **Kabul kriterleri:**
  - İlk açılışta ekran açılır; "Başla"ya basınca oyuna girilir. Yeniden açınca ekran tekrar gelmez, görünüm korunur.
  - Demo 1–3 kayıtları bozulmadan açılır (karakter ekranı çıkmaz).
  - Her seçenek değişince model anında güncellenir, takılma olmaz.
  - Panel tek elle rahat kullanılır; tüm dokunma alanları ≥48 px.
  - Ekran açıkken FPS 60'a yakındır; oyun sahnesi çizilmez.
  - Ayarlardan "Karakteri düzenle" çalışır ve ilerlemeyi bozmaz.
  - Model sürükleyince döner; pinch-zoom ve sayfa kayması yoktur.
- PNG ikonlar (iOS 180×180, Android 192/512, maskable) Demo 6C'de eklendi (§22).

### Demo 3 — İlk otomasyon
- Eşya sistemi (çiğ + tütsülenmiş), balık ağı ve sepet, penguen kulübesi ve penguen işçi (A* ile waypoint), veri odaklı bölge açma (buz duvarı kırılması + kamera gezdirme), Tütsühane bölgesi (tütsühane, 3. delik, 2. penguen), "Yakında" iskele duvarı, olta tezgâhı ve 4 olta yükseltmesi, "Yeni tür!" kartı, save v3, denge simülasyonu
- **Kabul kriterleri:**
  - Penguen ve ağ açıldıktan sonra telefona 3 dk dokunulmazsa coin yığını büyür.
  - Buz duvarı kırılma anı ve kamera gezdirmesi tatmin edicidir; çarpışma kalkar.
  - Tütsülenmiş balık satılınca çiğe göre belirgin şekilde fazla para gelir.
  - Yükseltmeler mini oyunda hissedilir fark yaratır (simülasyon tablolarıyla gösterilir).
  - Kalkan, yem seviye 3'ten önce asla çıkmaz.
  - Simülasyondaki açılış süreleri §8'deki hedeflere yakındır.
  - ~150 draw call bütçesi korunur; telefonda 60 fps hedeflenir.

### Demo 4 — Kariyer genişlemesi (§12–§16) — BİTTİ
5 aşamada, her aşama ayrı commit:
1. Zaman, gece/gündüz, hava (§12)
2. Tehditler: kutup ayısı ve çığ (§13)
3. İglo, uyku ve yapı setleri (§14)
4. Araziler, hikâye ve yeni gelir kolları (§15, §16)
5. Cila ve bütünleştirme: ayarlar (tehditler, gün uzunluğu, titreşim, dil), "Yeni tür!" düzeltmesi, GDD temizliği (Demo 5A ile birlikte yapıldı)
- **Kabul kriterleri:**
  - 8 dk'lık gün döngüsü sorunsuz akar. Gece/gündüz geçişi yumuşaktır, kuzey ışıkları gece görünür, fps düşmez.
  - Gece balıkları yalnızca gece çıkar; fırtına ve aurora buff'ı çalışır.
  - Ayı uyarısı net okunur, ilk seferde öğretici ipucu vardır. Aktif korkutma, meşale, ateş çukuru, kule ve yem tuzağı çalışır. Hiçbir senaryoda kalıcı kayıp yoktur.
  - Çığ uyarısı, kar yığını, temizleme ve çit çalışır; sandık ödülü gelir.
  - Uyku buff'ı çalışır, iglo seviyeleri görsel olarak değişir.
  - Buz Mağarası ve Kaplıca Kampı tam bir döngü oluşturur (üretim → işleme → satış); balıktan bağımsız gelir vardır.
  - 6 günlük sayfası bulunabilir, Günlük sayfası çalışır.
  - `threatScale = 0` ile oyun tehditsiz oynanır.
  - Save v3 → v4 göçü çalışır; eski kayıtlar bozulmaz.
  - ~150 draw call bütçesi korunur; telefonda 60 fps hedeflenir. typecheck, build ve sim hatasızdır.

### Demo 5 — Çevrimdışı gelir, yükseltmeler, ansiklopedi
- **5A — Çevrimdışı gelir ve yükseltmeler (§18):** Formülle hesaplanan çevrimdışı gelir yalnızca otomatik zincirden gelir ("Sen yokken…" penceresi, üst sınır ve verim). Olta tezgâhında sekmeli panel var: Olta, İstasyonlar (ağ, sepet, penguen, tütsühane, tezgâh, kamp, mağara) ve Zaman (çevrimdışı süre, verim). Save v5.
  - **Kabul kriterleri:** 1+ saat sonra açılınca doğru tutarla pencere çıkar; ağ ve penguen yoksa çıkmaz. Raflar, sepet ve tezgâh tutarlı kalır (çift sayma ve negatif değer yok). Çevrimdışıyken tehdit olmaz; saat geri alınırsa gelir verilmez. Üst sınır ve verim yükseltmeleri çalışır. Sim'de çevrimdışı oturum, aynı süre aktif oyunun en fazla ~%35'i olur. v4 → v5 göçü çalışır.
- **5B — Balık ansiklopedisi ve sipariş panosu (§19, §20):** Tür kartları, kg rekorları ve sayaçlar, altın ve gökkuşağı varyantları, koleksiyon ödülleri; tezgâhın yanında sipariş panosu (en fazla 3 sipariş, cezasız süre, ücretsiz yenileme).
  - **Kabul kriterleri:**
    - Ansiklopedi tüm türleri doğru gösterir; keşif, rekor ve sayaçlar doğru güncellenir; varyantlar çalışır.
    - Koleksiyon ödülleri yalnızca bir kez verilir.
    - Pano 3 sipariş gösterir; siparişler teslim edilir ve ödülleri gelir. İmkânsız sipariş gelmez, çevrimdışıyken süre akmaz.
    - Eski kayıtlarda yakalanmış türler ansiklopedide görünür.
    - Sipariş geliri toplamın ~%12'sini, altın ve gökkuşağı katkısı ~%3'ü geçmez.
    - Açılış süreleri bozulmaz; ~150 draw call bütçesi korunur.

### Demo 6 — Ses, müzik ve cila (§21, §22) — BİTTİ
Üç alt aşamada, her biri ayrı commit:
- **6A — Ses efektleri:** WebAudio ile sentezlenen efektler (dosya yok), tek AudioContext, grup ses seviyeleri, ilk dokunuşta başlatma, arka planda susma, uzaklığa göre kısılma, sık tetiklenen seslerde sınır.
- **6B — Müzik ve ambiyans:** Üretken, temposuz kuzey müziği (pad + seyrek pentatonik çanlar + yankı). Gün saatine ve duruma göre değişir: ayı gerilimi, mağara, kamp, uyku, kuzey ışığı. Ambiyans: rüzgâr, dalga, kar. Ayarlarda ses kaydırıcıları ve "Sessiz".
- **6C — Görsel cila:** Kalite ayarı (Düşük/Orta/Yüksek, yavaş cihaza bir kerelik öneri), FPS göstergesi ayarlarda, splash ekranı, PWA ikonları, "Hareketi azalt", juice/haptik tutarlılığı, görsel öğretici ipuçları, gece okunurluğu, GDD açık işler.
- **Kabul kriterleri:**
  - Sesler rahatsız etmez; iOS ve Android'de ilk dokunuştan sonra ses gelir; arka plana geçince susar.
  - Müzik gün/gece ve duruma göre değişir; ayı uyarısında gerilim katmanı gelir.
  - Ses ayarları kaydedilir; "Sessiz" tüm sesi kapatır ve sessizken işlemci harcanmaz.
  - Kalite ayarları çalışır; düşük kalitede FPS belirgin artar.
  - Splash ve ikonlar düzgündür; ana ekrana eklenince uygulama gibi açılır.
  - Telefonda 60 fps hedefi müzik açıkken de korunur; ~150 draw call bütçesi korunur. typecheck, build ve sim hatasızdır.

### Demo 7 — Panel yöneticisi, Penguen Pazarı, İskele (§23–§25)
Üç alt aşama, her biri ayrı commit (typecheck, build ve sim her aşamada). Sayılar `src/content/` altında (yeni: `roles.ts`, `penguins.ts`, `voyages.ts`, `harbor.ts`), his ayarları `settings.ts` içinde. `priceScale` yeni fiyatlara da uygulanır. Save v5 → v6 göçü yazılır. ~150 draw call ve 60 fps bütçesi korunur.
- **7A — Panel yöneticisi (§23) — BİTTİ:** Takılı kalan panel hatasının kök nedeni bulundu ve düzeltildi. Bütün paneller tek bir yöneticiden (`ui/PanelManager.ts`) geçiyor. Headless Chrome panel stres testleri var (`npm run test:panels`). Save hâlâ v5 (yeni ayar `debugTools` varsayılanla okunuyor); v5 → v6 göçü 7B'de yazılacak.
- **7B — Penguen Pazarı ve roller (§24) — BİTTİ:** Penguenler artık karakter: ad, rol, özellik, seviye/deneyim, bere-atkı görünümü. Altı rol (Taşıyıcı, Tütsücü, Madenci, Mutfakçı, Temizlikçi, Bekçi) veri odaklı; istasyonlar iş panosuna ilan verir, penguenler rollerine göre ilan alır, rezervasyon çift taşımayı önler. Yol grafiği mağara, kamp ve yem tuzağına uzatıldı. Kulübe 2 → 5 yer ve her seviyede büyüyor. Kulübenin yanındaki Penguen Pazarı (bağlamsal panel: Katalog | Penguenlerim | Kulübe). Çevrimdışı formül rol hızlarından. Save v6 (v5 → v6 göçü).
  - **Kabul (7B):** Roller çalışıyor; çakışma ve çift taşıma yok (`npm run test:panels -- roles`: madenci, mutfakçı, bekçi, temizlikçi gerçek oyunda işini yapıyor, takılan penguen yok). Pazar paneli yöneticiden açılıp kapanıyor (`-- market` ve `cycles` içinde 50 tur). Eski kayıtlar bozulmuyor (v5 test kaydı: 2 penguen Taşıyıcı + Tütsücü, eski 2. penguen yerine Pazar). typecheck, build ve sim hatasız. Sim hedefleri: 2. penguen ✓, ilk Madenci ✓, gelir kolları ✓, çevrimdışı ✓ (uç durum %42); 3. penguen ~6 dk erken (§17).
- **7C — İskele, seferler ve fener (§25):** Yeni fiil: SEFER. İki alt aşama, her biri ayrı commit:
  - **C-I (C1–C5):** Liman İskelesi arazisi (güneydeki "Yakında" duvarının arkası, tapu: günlük sayfası 3), 3 aşamalı tekne onarımı ve 4 tekne yükseltmesi, sefer sistemi (durum makinesi, sefer paneli, gerçek zamanlı ve çevrimdışı tamamlanma, ganimet rafı ve kasalar, olaylar, dev balık, otomatik sefer), 3 derin deniz türü, fok mürettebat (Pazar'da "Fok" sekmesi), Rıhtımcı rolü, save v7.
  - **C-II (C6–C11):** Kaptanın feneri (5 aşama, fener paneli, sezon kartı), günlük sayfaları 7–10, ansiklopedi ve sipariş türleri, iskele sesleri ve "iskele" müzik modu, sim'de seferler / foklar / Rıhtımcı ve denge.
  - **Kabul:** İskele tapusu ve tekne onarımı akıcı; sefer çıkış, dönüş ve çevrimdışı tamamlama doğru, ganimet çift sayılmıyor, kayıp yok. Sefer, fener ve fok panelleri PanelManager'dan geçiyor ve panel testleri geçiyor. Tehditler iskeleyi rahatsız etmiyor; fok ve Rıhtımcı çalışıyor. Fener tamamlanınca sezon kartı geliyor; eski kayıtlar bozulmuyor. Sim hedefleri tutuyor, çevrimdışı oran ~%40'ı geçmiyor. typecheck, build ve sim hatasız; 60 fps hedefi korunuyor.
- **Hata ayıklama araçları** (Ayarlar → Hata ayıklama → Araçlar, varsayılan kapalı): coin ver, zamanı ileri sar (saat/gün; gün atlatmak Pazar kataloğunu da yeniler), tehdit tetikle, panel durumu göstergesi (7A). 7B: "+XP" (bütün penguenlere deneyim) ve "İşler" (açık iş ilanları, her penguenin rolü, seviyesi, işi ve yükü). 7C: "Sefer ×" (sefer süresi çarpanı ×1 / ×0.25 / ×0.05; denizdeki seferin kalan süresine de uygulanır), "+Parça" (fener parçası) ve "Tekne" (onarım aşaması, sefer durumu ve kalan süre, raf + kasa, parçalar, fener aşaması).
- **Kabul (7A):** Panel test senaryoları hatasız geçer. Hiçbir panel takılı kalmaz, görünmez dokunuş yutucu katman kalmaz. Bütün paneller tek yöneticiden geçer. typecheck ve build hatasızdır.

### Demo 8 — Yayın hazırlığı
- Capacitor ile Android APK
- iOS (Mac + Xcode gerekir; TestFlight için Apple Developer üyeliği gerekir)

## 12. Zaman ve hava
- **Oyun saati:** 1 gün = 8 dk gerçek süre (`settings.ts`, ayarlardan kısa/orta/uzun). Dilimler: sabah, gündüz, akşam, gece. Zaman yalnızca oyun ekranı aktifken akar (arka planda ve karakter ekranında durur; çevrimdışı hesap yok).
- **Işık:** Hemisphere ve directional ışığın rengi/yoğunluğu, sis ve gökyüzü rengi zamana göre yumuşakça geçer. Gece lacivert-mordur, ay ışığı vardır. Gökyüzünde kuzey ışıkları dalgalanır (şerit mesh + additive materyal). İglo, kulübe ve tütsühane pencerelerinden gece sıcak ışık sızar. Geçişler yalnızca renk/uniform günceller, yeni materyal üretmez.
- **HUD:** Küçük güneş/ay ikonu ve altında "Gün N".
- **Gün özeti:** Sabaha geçerken "Gün N özeti" kartı: kazanılan coin, tutulan balık, satılan ürün, uyku bonusu. 4 sn sonra ya da dokununca kapanır, oyunu durdurmaz.
- **Gece etkileri** (`content/time.ts`):
  - Müşteri gelme sıklığı %60'a düşer.
  - Gece balıkları: "Ay morinası" (orta, parlak mavi) ve "Gece alabalığı" (büyük, mor). Yalnızca gece vurur, fiyatları gündüz eşdeğerinin ~1.5 katıdır, çekiş ve zorlukları eşdeğer türlerle aynıdır.
  - Kuzey ışıkları varken küçük bir "Işık balığı" şansı: yakalanırsa 1 dk boyunca satışlar +%10 (aurora buff'ı).
- **Kar fırtınası:** Gün başına ~%15 şans, 60–90 sn. Sis yoğunlaşır, kar yönü değişir, müşteri %30 azalır, nadir balık şansı +%50. Önce "Fırtına yaklaşıyor" şeridi, bitince bildirim.

## 13. Tehditler
**Ortak kurallar:** Tehditler cezalandırmaz, heyecan katar; kalıcı kayıp yoktur. İlk tehdit oyunun ilk 15 dk'sından ve tütsühane açılışından önce gelmez. Sinematikler (kamera turu, giriş sahnesi) sırasında tetiklenmez. `threatScale = 0` her şeyi kapatır; ayarlarda "Tehditler: Açık/Kapalı" anahtarı vardır.

**Kutup ayısı**
- **Uyarı:** 12 sn önce (gece 8 sn) ekran kenarında yön gösteren kırmızı ok, "Kutup ayısı yaklaşıyor!" şeridi, hafif düşük titreşim. Ayının geldiği yönde buzda ayak izleri belirir. İlk ayı öğreticidir: 20 sn uyarı ve "Yaklaş ve basılı tut!" ipucu.
- **Ayı:** Büyük low-poly krem rengi ayı, ağır yürüyüş, koklama. En çok "kokan" hedefe gider: sepet > tezgâh > tütsühane çıkış rafı > penguen (en çok balık olan).
- **Sonuç (hafif):** Sepet/tezgâh/raftaki balıkların yarısını alıp kaçar. Penguen ayıdan korkar, 45 sn kulübede saklanır. Oyuncunun sırtına dokunmaz. Bir sepet dolusu balıkta zarar en fazla ~40 coin'dir.
- **Aktif engelleme:** Ayıya 3 birim yaklaşıp basılı tutunca "Korkut": ayı arka ayaklarına kalkar, 1.5 sn dolum. Tamamlanınca ayı çekilir, yere ödül düşer (biraz coin, bazen "ayı tüyü"). Parmağı kaldırmak iptal eder. Meşale tezgâhından alınan 3 kullanımlık meşaleyle yalnızca yaklaşmak yeter (0.5 sn).
- **Pasif engelleme:** Ateş çukuru (12 birim yarıçapta ayı şansı −%40, uyarı +5 sn, en fazla 3). Gözetleme kulesi (uyarı +10 sn, menzildeki ayıyı işaretler ve aydınlatır). Yem tuzağı (bir çiğ balık bırakılır, ayı 8 sn oyalanır).
- Kaçan ayı iz bırakarak denize yürür.
- **Sıklık** (`content/threats.ts`): gündüz ~12 dk'da bir, gece ~7 dk'da bir.

**Çığ**
- Haritanın kenarındaki yamaç alanında tetiklenir (~15 dk'da bir).
- **Uyarı:** 6 sn önce yer sarsılır, kamera titrer, yamaçtan kar akar, "Çığ!" şeridi çıkar, etkilenecek koridorun zemini kırmızı-şeffaf çizgili olur.
- Çığ koridoru çarpışmalı kar yığınlarıyla kapatır. Üstünde ~2 sn durmak (kürek) yığını temizler; penguenler de temizler (en düşük öncelik). Temizlenmezse 90 sn'de erir. Yarısında "gömülü sandık" çıkar (coin ya da dekorasyon). Alandaki oyuncu en yakın güvenli noktaya hafifçe itilir.
- **Kar çiti:** Çitli koridorda uyarı gelir ama koridor kapanmaz.

**Uygulama (Demo 4 aşama 2):**
- Denge `content/threats.ts`, yerleşim `zones.ts` → `ThreatLayout` / `ThreatBuildingSpots`, his `settings.ts` → `ThreatFeel`. Saf kurallar `systems/ThreatLogic.ts` (oyun ve simülasyon ortak).
- Zamanlama: rastgele gelişler (ortalama gündüz 12 dk, gece 7 dk ayı; 15 dk çığ), aynı anda tek tehdit, her tehditten sonra 60 sn sessizlik, her oturumun ilk 90 sn'si sessiz. Toplam oyun süresi (`stats.playTime`) 15 dk'yı geçmeden ve tütsühane açılmadan hiçbir şey gelmez.
- Yapılar (isteğe bağlı kilit alanları, rehber ok göstermez): meşale tezgâhı 40 (tütsühaneden sonra), yem tuzağı 70 ve 1. ateş çukuru 90 (meşale tezgâhından sonra), 2.–3. ateş çukuru 150 / 220, kar çiti 120, gözetleme kulesi 450 (1. çukurdan sonra).
- Ayı kıyıdan (kuzey ya da doğu sudan) yüzerek gelir; tütsühane rafına geçitten iner. Sepette ya da tezgâhta en fazla 40 coin değerinde balık alır. Kaçarken korkutulursa aldığı balıklar yerine döner. Yakındaki her penguen kaçıp 45 sn kulübede saklanır.
- Korkutma ödülü 6–12 coin, %25 ayı tüyü. Sandık 20–40 coin.
- Simülasyon (`npm run sim`): aktif oyuncu ayıların neredeyse hepsini engelliyor; ilgisiz oyuncu ayı başına ortalama ~3 coin kaybediyor (en büyük tek kayıp 40'ın altında). Kayıp ve korkutma/sandık ödülleri satış gelirinin ~%1–2'si kadar: tehditler ekonomiyi bozmaz, yalnızca heyecan katar.

## 14. İglo ve uyku
- **İglo seviyeleri** (kilit alanıyla, `content/igloo.ts`):
  1. Basit iglo, kürk yatak (kalite 1)
  2. Ahşap çerçeveli iglo ve soba (kalite 2)
  3. Geniş iglo, halı, lamba (kalite 3)
  4. Konak iglo, şömine, cam çatı (kalite 4)
  Her seviye iglonun dışını da büyütür ve aydınlatır.
- **Uyku:** Gece iglo yatağında 1.5 sn durunca "Uyu": ekran kararır, zaman sabaha atlar, ayı/çığ riski sıfırlanır. Sabah, o gün boyunca geçerli "İyi dinlenmiş" buff'ı:

| Yatak | Satış değeri | Sarma hızı | Taşıma | Nadir balık |
|---|---|---|---|---|
| 1 | +%3 | – | – | – |
| 2 | +%6 | +%5 | – | – |
| 3 | +%9 | +%8 | +1 | – |
| 4 | +%12 | +%12 | +2 | +%10 |

  Uyku zorunlu değildir, yalnızca ödüldür; uyumamanın cezası yoktur. Bonus gün özetinde görünür.
- **Yapılar** (kilit alanıyla, `content/buildings.ts`): ateş çukuru, gözetleme kulesi, kar çiti, meşale tezgâhı; dekorasyon (bayrak direği, fener direkleri, kızak, balık kurutma askısı) "huzur" puanı verir. Hepsi kodla üretilir, ışıklı olanlar gece parlar, bounce ve kar tozuyla yükselir.

**Uygulama (Demo 4 aşama 3):**
- Sayılar `content/igloo.ts` (seviyeler, buff tablosu, uyku saatleri, huzur/bahşiş) ve `content/decorations.ts`; fiyatlar `Economy.unlocks` üzerinden `priceScale`'den geçer. His ayarları `settings.ts` → `SleepFeel`. Saf kurallar `systems/Rest.ts` (oyun ve simülasyon ortak).
- **İglo yükseltmesi:** İglonun doğusundaki tek kilit alanı; iglo 2 = 60 (penguen kulübesinden sonra), iglo 3 = 150 (tütsühaneden sonra), iglo 4 = 500 (iglo 3 ve 3. delikten sonra). Her seviyede kubbe büyür (2.3 → 2.75), çarpışma yeniden kurulur. 2: kapıda ahşap çerçeve, sobalı baca dumanı. 3: buz blok süsü, pencere ışıkları. 4: kuzey ışığı renginde parlayan cam çatı, taş baca, kapı fenerleri.
- **Yatak halkası:** Kapının önünde, dışarıda (iç mekân yok). Yatak köşesi seviyeyle değişir: kürk yatak → soba (2) → halı ve lamba (3) → şömine (4, titreşen ateş). Halkanın üstünde "Huzur: N" ve durum ("Uyu" / "Gece uyunur" / engel nedeni) yazar.
- **Uyku:** Günün %64'ünden (akşamın sonu) sabaha kadar. 1.5 sn halkada durunca ~1 sn kararma ve "Zzz" görünür. Karanlıkta tehditler biter, saat sabaha (gün %3) atlar, gün dönümü ve "Gün N özeti" normal işler, ardından ekran aydınlanır. Ayı uyarısı ya da ayı yaklaşırken, ayrıca çığ uyarısında uyunamaz. Atlanan gecede istasyonlar çalışmaz.
- **İyi dinlenmiş:** Uyanılan günün sonuna kadar geçerlidir; HUD'da kalite ve kalan dakika gösterilir. Satış bonusları (aurora + dinlenmiş + bahşiş) toplanır ve `Tuning.saleBonusCap` = %30'u aşamaz.
- **Dekorasyonlar** (sabit yerler, tütsühaneden sonra açılır): bayrak direği 20, kar adamı 30, paspas 15 (iglo 3'ten sonra), kızak 40, fener direkleri (2 adet) 60, kurutma askısı (lambalı) 80, buz heykeli 100 (iglo 4'ten sonra). Huzur puanı 1–4 arası. Fenerler ve askı lambası gece parlar.
- **Huzur → bahşiş:** Puan başına satışın %0.25'i, en fazla %5. Bahşiş coin'i nane yeşilidir ve yığının üstünde parlar. `peaceScore` (`systems/Rest.ts`) aşama 4'teki kaplıca kampı için hazırdır.
- **Rehber ok:** İglo ve dekorasyon çerçevelerini de gösterir (en ucuz karşılanabilir hedef kuralı korunur; tehdit yapıları yine gösterilmez). Satış yapılmış bir oyunda ilk gece "Dinlenmek için yatağa git" şeridi çıkar ve o gece ok yatağı gösterir. Oyuncu bir kez uyuyunca ipucu kalıcı olarak kapanır.
- Simülasyon (`npm run sim`): iglo 2 ~7:40, iglo 3 ~19 dk, iglo 4 ~34 dk. Buff'ın kendi etkisi +%10 (hedef ≤ %12). Uyuyup buff almamak, atlanan geceler yüzünden %6–7 kaybettirir; buff'la net etki ~+%3. Yani uyku ödüldür, kısa yol değildir.

## 15. Araziler ve hikâye
- **Arazi:** Tapu ile alınır: kilit alanı + hikâye ön koşulu. Her arazinin adı, amacı ve kendi mekaniği vardır.
  1. **Buz Mağarası** (yamaç tarafı): kazma fiili. Parlayan kristal damarının üstünde 2 sn basılı tutunca buz kristali çıkar, damar ~60 sn'de dolar. Kristal, mağara girişindeki "Kristal tezgâhı"nda "Buz heykelciği"ne işlenir ve Koleksiyoncu NPC'sine satılır. Koyu mavi-mor, titreşen ışıklı; ayı gelmez.
  2. **Kaplıca Kampı** (kuzeydoğu): misafir ağırlama. Turistler çadır ve yemek ister. Tütsülenmiş balıktan "Balık tabağı" yapılır ve turistlere satılır; çadır kirası da gelir. Huzur puanı turist gelişini ve bahşişi artırır. Yeni işçi: kamp görevlisi.
- **Güney duvarı** Demo 7C'de Liman İskelesi'nin tapu duvarı oldu (§25).
- **Hikâye:** Eski bir liman kaptanının günlük sayfaları dünyaya dağılmıştır. Bu demoda 6 sayfa: 3'ü ana hedeflerden, 3'ü keşiften (çığ sandığı, ayı ödülü, gizli kayalık). Sayfa = kısa günlük metni (tr/en) + tapu ya da küçük ödül. İlk sayfa tütsühane açılınca gelir ve Buz Mağarası'nı ima eder. HUD'dan açılan "Günlük" sayfası bulunanları gösterir, kalanlar gri "???". Hikâye rehber okun yerine geçmez, onu tamamlar. Hayalî kuzey kasabası; gerçek yerli halklar stereotip biçimde kullanılmaz.

**Uygulama (Demo 4 aşama 4):**
- Sayılar `content/land.ts` (tapu ve yapı fiyatları, mağara, mutfak, çadır), `content/guests.ts` (turistler) ve `content/story.ts` (sayfalar ve tetikleyiciler); sayfa metinleri `strings.ts`'de. Yerleşim `zones.ts` → `CaveLayout`, `CampLayout`, `StoryLayout`. Saf kurallar `systems/LandLogic.ts` ve `systems/StoryLogic.ts`'de; oyun ve simülasyon ortak kullanır.
- **Tapu:** Arazi, buz duvarlı bir bölge ve önündeki kilit alanıdır; ön koşulu bir günlük sayfasıdır (`isDone` sayfaları da sayar). Etiketi "Tapu: Buz Mağarası". Açılışta duvar kırılır ve kamera gezdirmesi oynar.
- **Buz Mağarası** (180, sayfa 1 + tütsühane): Yamaçta, tütsühane bölgesinin batısındaki köşeden girilir. Açık tavanlı, koyu mavi-mor zeminli; kuzey, batı ve güney duvarları kaya ve sarkıtlardan oluşur. 6 kristal damarının 3'ü küçük, 2'si orta, 2'si büyük; büyükler 2 kristal verir.
  - Damarın üstünde durup basılı tutunca (2 sn) kristal çıkar ve ~60 sn'de yeniden dolar. Oyuncu damar üstünde dururken dokunuşları mağara alır, joystick açılmaz; 40 px sürükleme yürümeye geçer.
  - Kristaller sırttaki yığının üstüne biner ve kapasiteyi balıkla paylaşır.
  - Kristal tezgâhı (90): giriş rafı 6, 5 sn/heykelcik, çıkış rafı 6.
  - Koleksiyoncu ilk kez tezgâhtan 25 sn sonra, sonra her 100 sn'de bir mağara ağzında belirir. 30 sn kalır ve çıkış rafındaki heykelcikleri tek tek alır. Heykelcik 16 coin'dir (+ huzur bahşişi); para mağaranın kendi coin yığınına düşer.
  - Mağara güvenli bölgedir: ayının hedefi ve yolu yoktur, çığ koridoru mağaraya dokunmaz.
- **Kaplıca Kampı** (380, sayfa 2 + mağara): Ana kıyının doğusunda, buz köprüyle bağlı yeni bir kara parçası. Kuzey ve güney açık sudur (ayı yüzerek geçer, oyuncu geçemez).
  - Kampta buharlı kaplıca (instanced buhar), 3 fener, 3 çadır (140 / 240 / 340), mutfak tezgâhı (180) ve kamp görevlisi (400) var.
  - Mutfakta tütsülenmiş balık 5 sn'de balık tabağına döner. Tabak değeri tütsü × 1.6 ≈ çiğin 4 katı; raflar 6'şar.
  - Turistler (renkli kıyafet, sırt çantası) ortalama 13 sn'de bir gelir; huzur gelişi %25'e kadar hızlandırır. Mutfak varsa kuyruğa girip tabak bekler (en fazla 50 sn). Sonra boş çadır varsa 75 sn kalıp kira öder (14 coin/dk), yoksa gider.
  - Oyuncu tabak rafının yanından geçince tabaklar kuyruğa tek tek uçar. Görevli varsa 1.4 sn'de bir kendisi servis eder.
  - Kamp gece de aynı hızla çalışır. Para kampın kendi coin yığınına düşer; bahşiş nane yeşili.
  - Ayı için tabak rafı en düşük öncelikli hedeftir ve 1. ateş çukurunun menzili kampı kapsamaz. Kayıp geçicidir: korkutulan ayı tabakları geri bırakır.
- **Günlük:**
  - Sayfa 1 tütsühane açılınca, 2 ilk kristalde, 3 ilk serviste gelir. Sayfa 4 ilk açılan çığ sandığından, 5 ilk korkutulan ayıdan, 6 penguen kulübesinin batısındaki kayalıklardan çıkar (rehber ok göstermez; yaklaşınca hafif parlar).
  - Sayfa bulunduğu anda kaydedilir ve kâğıt kartında gösterilir ("Günlüğe ekle"). Kart açıkken oyun sürer ama yeni tehdit başlamaz.
  - HUD'daki kitap düğmesi Günlük'ü açar: bulunan sayfalar yeniden okunur, kalanlar "???" ve ipucu satırıyla görünür.
- **Rehber ok:** Tapu, çadır, mutfak ve görevli çerçevelerini en ucuz karşılanabilir hedef kuralıyla gösterir. Kristal taşınırken tezgâhı gösterir. Oyuncu bölgenin batısındayken ve tezgâh boşken hazır bir damarı gösterir. Sayfalar hedef olmaz.

## 16. Yeni gelir kolları
- Değer zinciri: balık → tütsülenmiş balık (2.5×) → Balık tabağı (kamp, ~4×) ve buz heykelciği (mağara, ~6× ama yavaş). Üçü birbirini tamamlar; oyuncu tek gelire bağlı kalmaz.
- Açılış hedefleri (Demo 4 aşama 4'te güncellendi): iglo 2 ~8 dk, 3. delik ~22 dk, Buz Mağarası (tapu + kristal tezgâhı) ~26 dk, 2. penguen ~28 dk, iglo 4 ~32 dk, Kaplıca Kampı (tapu + ilk çadır) ~38 dk, kamp görevlisi ~45 dk.
- **Simülasyon (yükseltme almayan / alan bot, medyan):** 3. delik 22:06 / 23:07, Buz Mağarası tapusu 25:34 / 26:51, kristal tezgâhı 26:54 / 28:04, 2. penguen 28:53 / 30:20, iglo 4 32:24 / 33:41, kamp tapusu 36:09 / 37:47, ilk çadır 37:11 / 39:11, görevli 45:24 / 47:50.
- **Gelir dağılımı (yükseltme alan bot):** 60 dk'da balık %64 (çiğ %9, tütsü %55), kamp %11, mağara %25. 90 dk'da balık %57, kamp %17, mağara %27. Hiçbir kol %70'i geçmiyor, %10'un altında da kalmıyor.
- **Ayar çarpanları:** `priceScale` (tüm açılış ve yükseltme fiyatları) ve `threatScale` (0 = tehdit yok, varsayılan 1) `src/content/tuning.ts` içinde.
- Simülasyon gece/gündüzü, uyku buff'ını ve tehditleri de modeller; ayı kaybı ve engelleme oranı (aktif ve ilgisiz oyuncu) ile uyku buff'ının gelir etkisini (en fazla ~%12) raporlar.

## 18. Çevrimdışı gelir (Demo 5A)
- **Hesap formülle yapılır, simülasyon yoktur** (`systems/Offline.ts`). Oyun açılınca ya da arka plandan dönünce son kayıt zamanından (`lastSeenAt`) bu yana geçen süreye bakılır. Oyun saati çevrimdışı ilerlemez; tehdit olmaz, uyku buff'ı etkilenmez.
- **Yalnızca otomatik zincir sayılır, her adım bir darboğazdır:**
  1. Ağ (aralığı ve sepet kapasitesi) → Taşıyıcılar → tütsühane (işleme hızı) → Tütsücüler → tezgâh (kapasite dolunca penguenler durur) → müşteriler (gündüz ve gece ortalaması, ~0.44 eşya/sn). Tütsücü yoksa Taşıyıcılar iki turu birlikte yapar (Demo 3 davranışı).
  2. Kamp: çadır kirası (turist gelişi × huzur bonusu, çadırların kapasitesiyle sınırlı). Mutfak zinciri (Demo 7B): Mutfakçı (ya da Mutfakçı yokken Tütsücü) tütsüyü mutfağa taşır; tabaklar Mutfakçı ya da kamp görevlisi varsa turistlere satılır.
  3. Mağara: Madenci varsa kristal gelir (damarların dolma hızını geçmez, fazlası giriş rafında raf kapasitesine kadar bekler); tezgâh yontar, Koleksiyoncu ziyaretlerinde stoktan alır. Madenci yoksa yeni kristal yok.
  - **Rol hızları (Demo 7B):** Her penguen için tur süresi = 2 × iş yolunun uzunluğu (yol grafiğinden, `roles.ts` → `Jobs[...].legs`) / hız + taşıma × aktarma süresi × 2 + iş süresi (madencilik). Hız ve taşıma özellik ve seviyeyle değişir. Yeni sayı yok; oyun, sim ve formül aynı tabloları okur.
- Sonunda sepet, raflar ve tezgâh hesapla tutarlı biçimde güncellenir (satılan çıkar, taşınamayan yerinde kalır, ağ boş yerleri doldurur). Çift sayma ve negatif değer olmaz.
- **Oran ve üst sınır** (`content/economy.ts` → `offline`): %50, 2 saat; en az 60 sn. Ağ ve 1. penguen açılmadan gelir 0'dır ve pencere çıkmaz (penguen yoksa ağ yalnızca sepeti doldurur).
- **"Sen yokken…" penceresi:** Geçen süre, sayarak artan coin, "Üst sınır: X saat" ve tek büyük "Topla" düğmesi var. Coin doğrudan cüzdana eklenir; coin yığınlarına dokunulmaz. Toplanmamış tutar kaydedilir ve pencere yeniden açılır. "x2" düğmesi gelecekteki ödüllü reklam için gizli bir yer tutucudur (`settings.ts` → `OfflineFeel.showOfflineBoost`).
- **Hile sınırı:** Son görülme zamanı gelecekteyse (saat geri alınmış) gelir verilmez ve zaman düzeltilir. Çok uzun yokluklar yalnızca üst sınır kadar sayılır.

- **Simülasyon** (`npm run sim`, 8 saat yokluk, aşamanın açıldığı anki durum, medyan):

| Aşama | Taban (2 sa, %50) | Aktif oyuna oranı | Zaman yükseltmeleri tam (8 sa, %60) | Oranı |
|---|---|---|---|---|
| Ağ + 1. penguen | 1323 | %20 | 6334 | %24 |
| + tütsühane | 2491 | %25 | 11961 | %30 |
| + 3. penguen (Taşıyıcı) | 3317 | %18 | 15846 | %22 |
| + kamp (görevli, madenci) | 10115 | %32 | 48427 | %39 |
| + 5. penguen (Mutfakçı) | 10205 | %31 | 48692 | %38 |

  (Demo 7C ön işi, 12 koşu.) Çevrimdışı gelir aktif oyunu hiçbir durumda geçmiyor. En uç durum (kamp + madenci, bütün Zaman yükseltmeleri) %39: hedef ~%40'ın altında. Bunu sağlayan, verim yükseltmesinin üst değerinin %65'ten %60'a inmesi; 7B sonrası denenen `offlineMinerFactor` sonuç vermediği için (mağaranın çevrimdışı darboğazı Koleksiyoncu) kaldırıldı.

## 18.1 İstasyon ve zaman yükseltmeleri (Demo 5A)
- Olta tezgâhındaki panel sekmelidir: **Olta | İstasyonlar | Zaman** (`content/stationUpgrades.ts`). Her yükseltmenin 5 seviyesi var; Sv1 içerikteki varsayılan değerdir. Sonraki seviye taban × 1.6^(seviye − 1) × `priceScale`.
- **İstasyonlar:**
  - Ağ aralığı 6 → 3.6 sn (taban 50)
  - Sepet 8 → 10 → 12 → 15 → 20 (40)
  - Penguen hızı %100 → %150 (70)
  - Penguen taşıma 3 → 7 (90)
  - Tütsüleme 4 → 3 sn (80)
  - Tezgâh 12 → 16 → 20 → 25 → 30 (45)
  - Tabak süresi 5 → 3 sn (120, mutfak açıksa)
  - Çadır kirası 14 → 24 coin/dk (150, çadır açıksa)
  - Heykelcik 16 → 26 coin (140, kristal tezgâhı açıksa)
- **Zaman:** Çevrimdışı süre 2 → 3 → 4 → 6 → 8 saat (100), çevrimdışı verim %50 → %53 → %55 → %58 → %60 (120; Demo 6'da %70 → %65, Demo 7C öncesi %65 → %60: kamp + madenci aşamasında çevrimdışı oran ~%40'ın altında kalsın diye).
- Kartlar ilgili istasyon açılana kadar gizlidir. Kartta ikon, ad, seviye, "şimdi → sonraki" etki ve fiyat vardır. Satın alınca kart zıplar ve konfeti çıkar; para yetmezse kart sallanır.
- Değerler tek kaynaktan okunur (`systems/StationUpgrades.ts` → `stationValue`). Oyun, çevrimdışı formül ve simülasyon aynı değerleri kullanır.

## 19. Balık ansiklopedisi (Demo 5B)
- HUD'daki balık ikonu (günlüğün kitap ikonundan ayrı) alttan kayan, tam ekran bir sayfa açar. Oyun zamanı akmaya devam eder; sayfa açıkken yeni tehdit başlamaz. Sayfa açıkken oyun sahnesi yerine ansiklopedinin kendi küçük sahnesi çizilir.
- **Izgara:** Mevcut 7 tür kart olarak dizilir: kapelin, morina, alabalık, kalkan, ay morinası, gece alabalığı, ışık balığı. Keşfedilmemiş türler gri siluet ve "???" olarak görünür; keşfedilenler renklidir. Kartın köşesinde altın ve gökkuşağı rozetleri yer alır.
- **Ayrıntı:** Oyundaki aynı low-poly model döner. Altında ad, kg rekoru, toplam yakalama, ilk yakalama günü, nadirlik, ne zaman çıktığı (her zaman / gece / kuzey ışığı) ve kısa bir açıklama (tr/en) yer alır.
- **Varyantlar** (`content/codex.ts`): Mini oyunun zorluğu değişmez; yalnızca görünüm ve değer farklıdır.
  - **Altın:** Olta yakalamalarının %0.5'i; satış ×5, altın renk ve parıltı. İlk altında "Altın!" kartı çıkar.
  - **Gökkuşağı:** Yalnızca gece ve kuzey ışığı varken, %0.3; satış ×8, mor-yeşil arasında kayan renk.
  - Ağ varyant yakalamaz.
- **Rekor:** Yeni kg rekorunda yakalama kartında "Yeni rekor!" çıkar (ilk yakalamada çıkmaz).
- **Koleksiyon ödülleri** (her biri bir kez):
  - 3 tür: 10 coin
  - 5 tür: "Usta oltacı" unvanı (ayarlar panelindeki profilde görünür) ve nadir yem (120 sn boyunca büyük balık şansı +%25)
  - 7 tür: "Balık ağırlığı" heykeli (dekorasyon, huzur verir)
  - İlk altın: 50 coin; ilk gökkuşağı: 75 coin
  - Ödüller şeritle duyurulur ve sayfa açıkken de görünür.
- Eski kayıtlarda daha önce yakalanmış türler (`seen`) keşfedilmiş sayılır; sayaç ve rekorları sıfırdan başlar.
- **Denge (sim):** Varyantların olta değerine katkısı %2.4–3.0. Erken coin ödülleri ilk açılışları öne çekiyordu (ilk gece gelen "5 tür" yemi en büyük etkiydi); ödüller küçültüldü, nadir yem kısaltıldı. Açılış süreleri 5A hedeflerine ±1–2 dk yakın.

## 20. Sipariş panosu (Demo 5B)
- **Pano:** İglo ile tezgâh arasında, tezgâhın yanında duran ahşap bir pano; üstünde kâğıt parçaları vardır. Tütsühaneden sonra ucuz bir kilit alanıyla gelir. Teslim edilebilir sipariş varsa üstünde sarı ünlem görünür. Rehber ok siparişleri hedef almaz.
- **Panel:** Panoya yaklaşınca alttan açılır, uzaklaşınca kapanır. Aynı anda en fazla 3 sipariş vardır. HUD'daki pano ikonu siparişleri uzaktan gösterir; teslim yalnızca panonun başında yapılır.
- **Sipariş türleri** (`content/orders.ts`; havuz ilerlemeyle genişler, yapılamayacak sipariş üretilmez):
  - N çiğ balık
  - N tütsülenmiş balık (tütsühane açıksa)
  - N kg balık
  - Belirli bir türden N adet: yalnızca keşfedilmiş ve şu an tutulabilir türler; ışık balığı yok
  - N balık tabağı (mutfak açıksa)
  - N heykelcik (kristal tezgâhı açıksa)
  - Nadir görev, uzun süreli: bir altın balık ya da bir gece balığı
- **Teslim:** Kartta "Teslim et" düğmesi vardır. Eşyalar teslim anında sırttan (balık) ya da raftan (tabak, heykelcik) düşer; hiçbir şey önceden ayrılmaz. Eksik eşya varsa düğme pasiftir ve eksik miktar yazar. Ödül, coin yığınına değil doğrudan cüzdana gider.
- **Ödüller:** Coin, normal satış değerinin 1.5–2 katıdır (zor siparişte daha fazla) × `priceScale`. Bazen ek ödül gelir: nadir yem, ayı tüyü, dekorasyon parçası (en ucuz açık dekorasyon çerçevesinin yarısını öder) ya da eksik bir günlük sayfasının ipucu.
- **Süre:** 10–20 dk gerçek zaman (nadir görevler daha uzun). Süre dolarsa ceza yoktur, sipariş yalnızca silinir. Boşalan yere 60–120 sn içinde yenisi gelir. Süreler yalnızca oyun açıkken akar; çevrimdışıyken durur.
- **Yenile:** Bir siparişi ücretsiz değiştirir; sonra 3 dk bekleme başlar.
- **İlk sipariş** çok kolaydır ("2 çiğ balık").
- **Denge hedefi:** Siparişler toplam gelirin en fazla ~%10–12'si olur; ana kazanç tezgâhta kalır.
- **Sim:**
  - Siparişler 60 dk'da toplam gelirin %5.8'ini, 90 dk'da %5.4'ünü getiriyor.
  - Siparişe giden eşyanın tezgâhtaki satış değeri ödülün ~%58'i; net kazanç pozitif.
  - Bot çiğ, kg, tür, gece ve heykelcik siparişlerini çoğunlukla tamamlıyor.
  - Altın balık siparişi uzun sürüyor (medyan ~17 dk; süre 30–40 dk).
  - Tütsü ve tabak siparişlerini bot az tamamlıyor, çünkü tütsüyü tezgâha ya da mutfağa önce bırakıyor. Oyuncu bunları raftan / sırttan seçerek teslim eder.

## 21. Ses ve müzik (Demo 6)
- **Dosya yok, her şey sentez** (WebAudio). Sayılar `content/audio.ts`'de: efekt tarifleri, sınırlar, müzik dizileri, ambiyans seviyeleri.
- **Motor** (`src/audio/AudioEngine.ts`):
  - Tek bir AudioContext; master'ın altında efekt, müzik ve ambiyans grupları.
  - Ortak gürültü tamponu ve eşzamanlı ses sınırı var (çöp üretmeyen havuz).
  - Bağlam ilk dokunuşta başlatılır; "Sessiz" açıksa hiç başlatılmaz.
  - Arka plana geçince askıya alınır, dönünce devam eder.
- **Efektler:**
  - Yumuşak ve kısa sesler, keskin tını yok.
  - Dünya sesleri oyuncuya uzaklıkla kısılır, uzakta neredeyse duyulmaz.
  - Aynı ses en fazla belirli aralıkla çalar (ör. coin 30 ms).
  - Coin toplarken perde zincirleme yükselir; makara tıkırtısının perdesi misina gerilimiyle artar.
- **Müzik** (`MusicDirector`):
  - Temposuz, üretken ve sakin. Pad, çok yavaş geçen akorlar çalar; üstünde seyrek pentatonik çan notaları, hepsi hafif bir yankıyla.
  - Ruh hali `setMood(...)` ile verilir: gündüz açık ve sıcak, akşam yumuşak, gece daha düşük ve parlak. Kuzey ışığında camsı bir üst katman gelir. Ayı uyarısında müzik kısılır ve gerilim katmanı girer. Mağarada daha yankılı ve kristal tınılı, kampta daha sıcak, uykuda solar.
  - Geçişler yumuşak çapraz solmadır.
  - Gerçek parçalar için `loadTrack(url)` kancası var (kullanılmıyor).
- **Ambiyans:** Rüzgâr her zaman hafiftir, fırtınada güçlenir. Dalgalar denize yakınken duyulur. Gece daha sessizdir; yürürken kar çıtırtısı gelir.
- **Ayarlar:** Ana ses, Müzik, Efektler, Ambiyans (0–100) ve "Sessiz"; kaydedilir. Müzik kapalıyken müzik düğümleri durur.

## 22. Görsel cila, kalite ve erişilebilirlik (Demo 6C)
- **Kalite ayarı** (Ayarlar → Görüntü; varsayılan Orta). Değerler `settings.ts` → `QualitySettings`:
  - Düşük: piksel oranı 1, kar %45, kaplıca buharı %40, tek kuzey ışığı perdesi, PBR yerine Lambert gölgelendirme.
  - Orta: piksel oranı en fazla 1.5, kar %80, buhar %75.
  - Yüksek: piksel oranı en fazla 2, tüm efektler.
  - Değişiklik anında uygulanır. Sonradan kurulan yapılar da 2 sn içinde sade gölgelendirmeye geçer.
- **Yavaş cihaz önerisi:** FPS 5 sn üst üste 40'ın altında kalırsa (açılıştan ve arka plandan dönüşten sonraki ilk 8 sn sayılmaz) bir kez "Düşük kaliteye geçilsin mi?" sorulur. Cevap ne olursa olsun bir daha sorulmaz.
- **FPS sayacı** varsayılan kapalıdır; Ayarlar → Hata ayıklama → "FPS sayacı" ile açılır.
- **Açılış:** ~1.5 sn splash (ikon, "Northbite", dönen kar tanesi ve yağan kar). İlerleme çubuğu yok. Ardından kayıt varsa oyun, yoksa karakter ekranı gelir. Oyun splash'in arkasında kurulur.
- **İkonlar ve PWA:** Buz deliği ve oltanın üstünde kuzey ışığı, oyunun paletiyle. `tools/make-icons.mjs` SVG'leri yazar ve Chrome ile PNG'leri üretir: 192, 512, maskable 512 (%80 güvenli alan), apple-touch-icon 180. Manifest ve tema rengi gece mavisidir (`#0E1A3A`), splash arka planıyla aynıdır.
- **Hareketi azalt** (Ayarlar → Görüntü): Kamera sarsıntıları %20'ye iner, parıltılar %35'e düşer, CSS'teki döngülü ve zıplayan animasyonlar durur. Cihazın "hareketi azalt" ayarı splash'teki karı da kapatır.
- **Öğretici ipuçları** (ilk 2 dk): Yazı yerine el animasyonu kullanılır. "Sürükle ve yürü" ipucunda el bir halka üzerinde sürükler. İlk 3 yakalamada "!" uyarısında dokunan el, ilk 3 çekişte göstergede basılı tutan el görünür. Rehber ok yerinde kalır. 2 dk'dan uzun oynamış kayıtlarda yürüme ipucu çıkmaz.
- **Gece okunurluğu:** Gece (gece seviyesi > 0.55) ve fırtınada HUD, etiketler ve banner'lar daha koyu ve dolgun bir arka plana geçer, ince bir açık çerçeve alır, yazılar gölgelenir.

## 23. Panel yönetimi (Demo 7A)
Bütün paneller tek bir yöneticiden geçer: `ui/PanelManager.ts` (`panels`). Paneller kendi açma/kapama kodlarını tutmaz; kayıt olur, `panels.open / showCard / close` çağırır.

**Kök neden (takılı kalan paneller):**
1. **Olta tezgâhı paneli ekrandan çıkılamıyordu.** Panel ekranın ~%66'sını kaplıyor ve kapatma düğmesi yoktu; yalnızca tezgâh halkasından yürüyerek kapanıyordu. Joystick ise yalnızca ekranın alt %70'inde başlıyor. 390×844 bir telefonda yürümeye başlanabilecek alan ~35 px'lik bir şeritti; oyuncu çoğu zaman paneli kapatamıyordu.
2. **Sipariş panosu kapanınca hemen yeniden açılıyordu.** Oyuncu panonun halkasında durduğu sürece "Kapat" basıldığı karede panel tekrar açılıyordu ("kapanmıyor" hissi).
3. **İki alt panel üst üste binebiliyordu.** Tezgâh halkasındayken HUD'dan pano açılabiliyordu; biri kapanınca öteki altta açık kalıyordu.
4. Geri tuşu (Android) ve Escape hiçbir paneli kapatmıyordu; Android'de geri tuşu oyundan çıkıyordu.

**Test edilen ve sorun çıkmayan varsayımlar:** Kapanış hiçbir yerde `transitionend`/`animationend` olayına bağlı değildi ("Hareketi azalt" ve arka plan bunu etkilemiyordu). Kapalı alt paneller ekran dışında `pointer-events: auto` ile duruyordu ama ekranda dokunuş yutmuyordu (tarama testi). `pointercancel` ve `lostpointercapture` dokunuş yönlendiricide zaten işleniyordu. Bunlar yine de yöneticiyle sertleştirildi (aşağıda).

**Panel türleri ve kurallar:**
- **MODAL:** ansiklopedi, günlük, ayarlar, karakter düzenleme, "Sen yokken", kalite önerisi.
- **BAĞLAMSAL:** olta tezgâhı, sipariş panosu, Penguen Pazarı (7B), sefer paneli (7C), fener paneli (7C). Halkaya bağlıdır.
- **KART:** gün özeti, yakalama / "Yeni tür!" kartı, günlük sayfası. Kısa sürelidir, sıraya girer.
- **ŞERİT:** bildirim banner'ı. Yalnızca olay günlüğüne yazılır.
- Aynı anda en fazla bir modal ya da bağlamsal panel açık olur. Yeni bağlamsal ya da kullanıcının açtığı modal, açık olanı kapatır. Sistemin açtığı modal ("Sen yokken", kalite önerisi) sıraya girer. Bağlamsal panel açık bir modalı itemez.
- Kartlar üst üste binmez, sırayla gösterilir; modal açıkken bekler.
- Kapanma yolları:
  - × / Kapat düğmesi.
  - Dışarı dokunma: bağlamsal panellerde ve kartlarda; ayarlar ve günlükte arka plana dokunma. Yakalama kartı dışarı dokunuşla kapanmaz, dokunuşlar balık tutmaya gider.
  - Escape / Android geri tuşu.
  - Halkadan çıkma, zorla hareket (itme, ışınlama), kilit (uyku, kamera turu, giriş sahnesi).
  - Arka plana geçiş: bağlamsal paneller kapanır, modaller açık kalır.
  - Uzaktan açılan pano 30 sn dokunuşsuz kalırsa kapanır.
- **Tekrar açılma kuralı:** Halkada dururken kapatılan (×, dışarı dokunma, geri) bağlamsal panel, oyuncu halkadan çıkana kadar yeniden açılmaz.
- **Dokunuşlar:** Modal ya da bağlamsal panel açıkken oyun dokunuşları (joystick, mini oyun) kapalıdır ve tutulan bütün pointer'lar bırakılır. Paneli dışarı dokunarak kapatan dokunuş oyuna geçmez. Panel kapandığı an oyun dokunuşları geri gelir.
- **Kapalı panelin garantisi:** Kapanan panel hemen `inert` ve `aria-hidden` olur; CSS'te `[inert]` dokunuş almaz. Kayma süresinden sonra (450 ms, olay değil zamanlayıcı) `visibility: hidden` olur. Ardından otomatik denetim (`audit`) ekranı 6×12 noktada tarar; kapalı bir panel dokunuş yakalıyorsa sorun kaydeder.
- **Geri tuşu:** Panel açılınca tek bir geçmiş kaydı eklenir. Geri tuşu bu kaydı tüketir ve en üstteki paneli kapatır: modal açıksa önce modal (kartların üstünü örter), yoksa önce kart, sonra bağlamsal panel. Oyun kendisi hiç `history.back()` çağırmaz; testte bu çağrının geçmişi kaydırıp sayfadan çıkardığı görüldü. Yeni oyuncunun karakter ekranı geri tuşuyla kapanmaz.
- **Hata ayıklama:** Ayarlar → Hata ayıklama → Araçlar açılınca HUD'un altında bir çubuk çıkar: +1000 coin, +1 saat, +1 gün, ayı, çığ ve "Paneller". "Paneller" açık panelleri, kuyruktaki kartları, son 10 panel olayını ve denetim sorunlarını gösterir.

**Envanter:**

| Panel | Tür | Kim açar | Nasıl kapanır |
|---|---|---|---|
| Olta tezgâhı (Olta / İstasyonlar / Zaman sekmeleri) | bağlamsal | Tezgâh halkasında 0.2 sn durmak | ×, dışarı, geri, halkadan çıkma, kilit, arka plan |
| Sipariş panosu | bağlamsal | Pano halkasında durmak; HUD pano düğmesi (uzaktan) | Kapat, dışarı, geri, halkadan çıkma, 30 sn dokunuşsuz (uzaktan), kilit, arka plan |
| Penguen Pazarı (Katalog / Penguenlerim / Kulübe / Fok) | bağlamsal | Pazar halkasında 0.2 sn durmak | ×, dışarı, geri, halkadan çıkma, kilit, arka plan |
| Sefer paneli (Seferler / Tekne) | bağlamsal | İskele ucundaki sefer noktası halkasında 0.2 sn durmak | ×, dışarı, geri, halkadan çıkma, kilit, arka plan |
| Ansiklopedi | modal | HUD balık düğmesi | Kapat, geri |
| Günlük | modal | HUD kitap düğmesi | Kapat, arka plana dokunma, geri |
| Günlük sayfası kartı | kart | Sayfa bulununca (Story) | "Günlüğe ekle", dışarı, geri (ilk 0.6 sn korumalı) |
| Ayarlar | modal | HUD dişli | Kapat, arka plana dokunma, geri, "Karakteri düzenle" |
| Karakter düzenleme | modal | Ayarlar → Karakteri düzenle; ilk açılış | Kaydet / ×, geri (yalnızca düzenlemede) |
| Sen yokken | modal (sıralı) | Açılışta / arka plandan dönüşte | Topla, geri (geri de toplar) |
| Kalite önerisi | modal (sıralı) | Yavaş cihaz | Evet / Hayır, geri (= Hayır) |
| Gün özeti | kart | Şafak | Kendiliğinden (4 sn), dokunma, dışarı, geri |
| Yakalama / "Yeni tür!" kartı | kart | Balık yakalanınca | Kendiliğinden; yeni yakalama eskisinin yerini alır |
| Bildirim banner'ı | şerit | Çeşitli olaylar | Kendiliğinden (dokunuş almaz) |

**Otomatik testler:** `node tools/panel-test.mjs [cycles storm pairs joystick forced lang] [--reduce-motion] [--throttle N] [--cycles N]` kendi Vite sunucusunu ve headless Chrome'u açar, gerçek dokunuş ve tuş olayları gönderir:
- Her panel 200 kez açılıp her yoldan kapatılır; bağlamsal panellerde 50 tur.
- Rastgele 600 dokunuşluk fırtına, iki panel çakışmaları, panel açıkken joystick.
- Panel açıkken itme, iglo yükseltmesi, uyku, kamera turu, arka plan ve dil değişimi.
- Her bölümün sonunda: açık ya da kuyrukta panel yok, denetim temiz, oyun dokunuşları açık, tutulan pointer yok.

**7A test sonuçları** (52 kontrol, 390×844 mobil görünüm): normal 52/52, "Hareketi azalt" açık 52/52, sayfa hatası yok. Önceki tam turda CPU 6× yavaşlatılmış koşu, çökme anına kadar 33/33 geçti; çökme, test sürerken kaynak dosyası düzenlenip Vite sayfayı yeniden yüklediği için oldu. Düzeltilmiş kodla yavaşlatılmış koşu yarıda durduruldu.

Testlerin yakaladığı iki hata düzeltildi:
- `history.back()` kullanan geri tuşu düzeni, panel değişiminde geçmişi kaydırıp sayfadan çıkabiliyordu.
- Açık bir modalın altında kalan kart, geri tuşuyla modalden önce kapanıyordu.

## 24. İşçiler ve roller (Demo 7B)
Sayılar `content/roles.ts` (iş ilanları ve roller) ve `content/penguins.ts` (adlar, özellikler, seviyeler, görünüm, fiyatlar, kulübe, Pazar); his ayarları `settings.ts` → `WorkerFeel`, `MarketFeel`. Saf kurallar `systems/PenguinLogic.ts` ve `systems/JobBoard.ts` (oyun, save göçü ve sim ortak).

**Penguen (kayıtlı):** id, ad (40 adlık havuzda indeks; tr ve en aynı sırada, dil değişince ad da çevrilir), rol, özellik, seviye ve toplam deneyim, görünüm (bere rengi ya da beresiz, atkı rengi; oyuncunun bere/atkı paletinden), ödenen fiyat, sırtındakiler (balık, kristal ya da tabak). İsim değiştirilmez.

**Özellikler:**

| Özellik | Etki | Fiyat çarpanı |
|---|---|---|
| Hızlı | +%20 hız, −1 taşıma (en az 1) | ×1.1 |
| Güçlü | +1 taşıma, −%15 hız | ×1.1 |
| Çalışkan | Deneyim +%50 | ×1.05 |
| Dengeli | — | ×1 |
| Sevimli | Huzur +1 (bahşiş ve turist gelişine katılır) | ×1 |

**Seviye 1–5:** her seviye +%4 hız. Deneyim: teslim edilen her parça (balık, tabak, kristal, yem) 1, temizlenen her kar yığını 4. Eşikler (toplam) 0 / 40 / 110 / 220 / 380. Seviye atlayınca penguen kanat çırpar, parıltı çıkar, kısa bir cıvıltı ve "{ad} seviye N oldu!" şeridi gelir.

**Roller** (rol yalnızca gerektirdiği yapı açıksa katalogda çıkar ve atanabilir):

| Rol | Gerekir | İşler (öncelik sırasıyla) | Taban fiyat |
|---|---|---|---|
| Taşıyıcı | Kulübe | (Tütsücü yoksa) tütsü → tezgâh; sepet → tütsühane girişi (yer varsa); sepet → tezgâh. Temizlikçi yoksa kar yığını da kazar. | 180 |
| Tütsücü | Tütsühane | (Mutfakçı yoksa ve mutfak açıksa) tütsü → mutfak girişi; tütsü → tezgâh | 175 |
| Madenci | Kristal tezgâhı | Hazır bir damara gider, 4 sn kazar (oyuncu 2 sn), kristalleri tezgâhın giriş rafına bırakır | 260 |
| Mutfakçı | Mutfak | Tabak rafı → kuyruktaki turist (servis); tütsü → mutfak girişi | 260 |
| Temizlikçi | Tütsühane | Çığ kar yığınlarını temizler (önce raflara bakan "kapı" yığını, sonra koridor boyunca doğudan batıya); iş yoksa kulübe önünde bekler | 150 |
| Bekçi | Tütsühane | Ayı uyarısı +5 sn (en fazla 2 bekçi sayılır), yaklaşan ayıyı her yerde "!" ile işaretler, yem tuzağını sepetten aldığı çiğ balıkla kendi kurar | 160 |

| Rıhtımcı (7C) | İskele tapusu | İskele ganimet rafı → tütsühane girişi; ganimet rafı → tezgâh | 240 |

Rıhtımcı veri olarak eklendi (`roles.ts`: iki iş, `lootRack` mağazası); yeni kod yolu yok.

**İş panosu (B4):**
- İstasyonlar "mağaza" (store) olarak tanımlıdır: sepet, tütsühane giriş/çıkış rafı, tezgâh, mutfak girişi, tabak rafı, servis (kuyruktaki sıradaki turist), kristal damarı, kristal tezgâhı girişi, yem tuzağı. Her biri ne kadar verebileceğini (`takeable`), ne kadar yer olduğunu (`room`) ve hangi eşyayı kabul ettiğini söyler.
- İlan = içerikteki bir iş (nereden, nereye, en fazla kaç parça, iş süresi): miktar her an canlı stoktan hesaplanır (kaynaktaki parça − rezerve, hedefteki yer − rezerve). İlanlar kaydedilmez.
- Penguen boştayken kendi rolünün işlerini öncelik sırasıyla dener, ilk açık ilanı taşıyabileceği kadar rezerve eder. Rezervasyon kaynakta parçaları, hedefte yerleri tutar; başka penguen aynı parçaları ya da yerleri alamaz. Damar gibi tekil kaynaklar ayrıca sahiplenilir (bir damarda tek madenci).
- Oyuncu her işi elle de yapabilir. Oyuncu eşyayı önce alırsa ilan küçülür: penguen gelir, kalanı alır ya da boş bulup başka işe geçer. Parçalar fiziksel olarak taşındığı için çift sayım olmaz.
- Hedef doluysa penguen 6 sn bekler, sonra elindekini kabul eden ve yeri olan başka bir hedefe götürür (ör. mutfak doluysa tezgâh).
- Sırtında eşyayla başlayan (yeniden yükleme, rol değişimi, ayıdan saklanma) penguen önce onu teslim eder (kendi rolünün işleri önce, sonra eşyayı kabul eden herhangi bir hedef).
- Rıhtımcı (7C) aynı panoyu kullanıyor; foklar tekneye bağlı olduğu için panoya girmez (§25). Yeni roller de aynı yoldan gelir: yeni rol = `roles.ts`'e bir satır, yeni istasyon = bir mağaza.
- Yol bulma aynı A* waypoint grafiği; Demo 7B'de mağara (tütsühane bölgesinin güneyi → yamaç köşesi → mağara ağzı, mağara tapusuyla açılan kenar), kamp (tezgâhın doğusu → buz köprü, kamp tapusuyla açılan kenar → mutfak, tabak rafı, servis) ve yem tuzağı (sepetin doğusundan, iglonun etrafından) eklendi.
- Hata ayıklama → "İşler": açık ilanlar ve her penguenin rolü, seviyesi, durumu, işi (nereden → nereye) ve yükü.

**Kulübe kapasitesi:** 2 → 3 → 4 → 5 yer; yükseltme 300 / 380 / 560 (× `priceScale`), Pazar panelinin Kulübe sekmesinden. Kulübe her seviyede %8 büyür: 2'de arkada yataklı bir sundurma, 3'te ikinci pencere ve çiçek kutusu, 4'te çatı penceresi, bayrak ve kapı feneri (pencereler gece yanar). Boştaki penguenler kulübe önünde beş ayrı yerde bekler.

**Penguen Pazarı:**
- Kulübenin batısında çizgili tenteli küçük bir tezgâh; tütsühaneden sonra 40 coin'lik kilit alanıyla gelir. Önündeki halkada 0.2 sn durunca bağlamsal panel açılır (PanelManager, §23): **Katalog | Penguenlerim | Kulübe**.
- **Katalog:** Her oyun günü yenilenir; 3–4 aday, roller mümkün olduğunca farklı, yalnızca şu an çalışabilecek roller. Kartta SVG portre (görünüm renklerinden, ayrı renderer yok), ad, rol ve kısa açıklama, özellik ve etkisi, fiyat ve "Satın al". Kulübe doluysa düğme soluk ve "Kulübe dolu" yazar; para yetmezse kart sallanır. Ücretsiz "Yenile" (sonra 3 dk bekleme).
- **Penguenlerim:** Her satırda portre, ad, rol, seviye, özellik, deneyim çubuğu ve "Rolü değiştir" (açık roller çip olarak açılır; ücret 25 × `priceScale`).
- **Kulübe:** Doluluk (N/M), seviye noktaları ve yükseltme kartı.
- **Fiyat:** rol tabanı × özellik çarpanı × sayı çarpanı × `priceScale`. İlk 3 penguen (kulübenin hediyesi dahil) taban fiyattır; sonra her biri ×1.45 (4. penguen ×1.45, 5. ×2.1). Fiyat gösterilirken hesaplanır.
- Satın alınan penguen kulübe kapısından zıplayarak çıkar, parıltı ve kar tozu, "{ad} aramıza katıldı!" şeridi.
- Panel yeniden çizimi: yapı (adaylar, penguenler, roller, kulübe seviyesi, sekme) değişince kurulur; coin, süre ve deneyim çubukları yerinde güncellenir, böylece coin akarken dokunuş kaybolmaz.

**Eski kayıtlar (v5 → v6):** Penguenler korunur. 1. penguen Taşıyıcı, 2. penguen tütsühane açıksa Tütsücü (değilse Taşıyıcı); ad, özellik ve görünüm sabit tohumla (`SaveSettings.penguinSeed`) üretilir, seviye 1. Eski "2. penguen" kilit alanı kalktı: onu almış kayda Pazar tezgâhı verilir; ona yarım dökülmüş coin cüzdana iade edilir. Kulübe seviyesi en az penguen sayısını alacak kadar olur. Kurutma askısı dekorasyonu artık Pazar'dan sonra çıkar.

**Simülasyon** (`npm run sim`, 8 koşu, medyan; yükseltme almayan / alan bot):
- Bot sırası: hediye Taşıyıcı → Tütsücü → Taşıyıcı → Madenci → Mutfakçı. Kulübe doluysa önce kulübeyi büyütür; istediği rol katalogda yoksa ücretsiz yenilemeyi kullanır. Bot her şeyi "karşılanabilir en ucuz hedef" kuralıyla alır.
- Pazar 15:54 / 17:01. **2. penguen 26:34 / 28:29** (hedef ~28). **3. penguen 33:19 / 34:50** (hedef ~40, erken; §17). **İlk Madenci (4. penguen) 52:47 / 55:47** (hedef ~50), Mutfakçı (5.) ~57–61 dk.
- Rol etkisi (gelir/dk, önceki 10 dk → sonraki 10 dk; o arada açılan her şey dahil): Tütsücü 70 → 134 (+%91), Madenci 158 → 247 (+%56), Mutfakçı 215 → 271 (+%26).
- Gelir kolları: 60 dk balık %59 / kamp %15 / mağara %27; 90 dk %39 / %30 / %31. Hiçbiri %70'i geçmiyor, %10'un altına düşmüyor.
- 3 dk hareketsiz coin: ağ + 1. penguen 76, tütsühane 91, 2. penguen (Tütsücü) 199, 3. penguen 211.
- Çevrimdışı (8 sa yokluk, aynı süre aktif oyuna oran): taban (2 sa, %50) %19–%32; Zaman yükseltmeleri tam (8 sa, %65) %23–%42. En uç durum kamp + madenci aşamasında %42 (hedef ~%40). Demo 7C ön işinde verim üst değeri %60'a indi: uç durum %39 (§18).

## 25. İskele, seferler ve fener (Demo 7C)
Sayılar `content/harbor.ts` (tapu ve onarım fiyatları, tekne yükseltmeleri, ganimet rafı, dev balık, foklar, fener) ve `content/voyages.ts` (hedefler, ganimet tabloları, olaylar, çevrimdışı kural); his ayarları `settings.ts` → `HarborFeel`. Saf kurallar `systems/VoyageLogic.ts` (oyun, çevrimdışı hesap ve sim ortak; Three.js ve DOM yok). Bütün fiyatlar `priceScale`'den geçer.

**Arazi: Liman İskelesi (C1)**
- Güneydeki ağaç kuşağındaki geçit; eski "Yakında" duvarı artık tapu duvarı. Tapu 520, ön koşul Kaplıca Kampı ve günlük sayfası 3 ("Işıkların sırrı", güneydeki iskeleyi ima eder). Duvar kırılır, kamera turu iskeleye gider.
- Yerleşim (`zones.ts` → `HarborLayout`): geçidin güneyinde bir kara şeridi; doğuya denize uzanan ahşap iskele (yürünebilir güverte), güney yanında bağlı tekne, iskele kökünde ganimet rafı ve kasalar, batısında iskele coin yığını, eski depo, kumsalda çürümüş tekne iskeleti, 4 fener direği (gece yanar), halat korkuluk. Kuzeydoğuda kayalık adada kaptanın feneri. Ambiyans: daireler çizen martılar (instanced).
- Hareket sınırı güneye genişledi (`moveBounds`); şeridin batısı ve iskelenin çevresi çarpışmalı (su olanlar ayının yüzebildiği su).
- **Güvenli bölge:** Ayı iskele güvertesine çıkmaz. Ayının hedef listesinde ganimet rafı en sondadır (tabak rafından da sonra); korkutulursa aldığı balıklar rafa (raf doluysa kasaya) geri döner.

**Tekne onarımı ve yükseltmeleri (C2)**
- Güvertedeki tek kilit alanı üç aşama: gövde 260 → yelken 320 → kamara 420. Tekne her aşamada yeniden kurulur ve zıplayarak belirir: 0 çürük, eğik, delikli gövde; 1 boyalı gövde ve beyaz şerit; 2 direk, bum ve yamalı yelken (hafif dalgalanır); 3 kırmızı çatılı kamara, gece yanan pencere. Talaş/kar tozu, parıltı, küçük kamera sarsıntısı, çekiç sesi, titreşim ve şerit.
- **Tekne yükseltmeleri** (sefer panelinin Tekne sekmesi; 5 seviye, fiyat taban × 1.6^(seviye − 1)): hız (süre %100 → %92 → %84 → %75 → %65; taban 160), kargo (ganimet rafı 8 → 10 → 12 → 15 → 18; 140), mürettebat yeri (1 → 1 → 2 → 2 → 3; 200), gemi feneri (gece çıkışta gecikme riski %40 → 0; 120). Gecikme süreyi %20 uzatır.
- **Tekne seviyesi** = 1 + alınan yükseltme seviyeleri / 2. Seviye 3'te otomatik sefer açılır.
- Kalıcı kayıp yoktur; tekne batmaz.

**Sefer sistemi (C3)**
- Durum: hazır → yolda (kalan süre) → döndü (ganimet rafta) → toplandı (oyuncu paneli açınca ya da raftan ilk eşyayı alınca). Aynı anda tek sefer. Çıkışta erzak ücreti ödenir (Sığ Resif 20, Buzdağı 35, Batık Gemi 50).
- **Sefer noktası:** İskele ucundaki halkada 0.2 sn durunca sefer paneli açılır (PanelManager, bağlamsal). Seferler sekmesi: durum (yolda iken kalan süre çubuğu ve olay), mürettebat çipleri (fok seç / bırak, yer sayısı kadar), otomatik sefer anahtarı (seviye 3'ten sonra), hedef kartları (ad, süre, beklenen ganimet, ücret, kilit durumu, "Çık").
- **Hedefler:** Sığ Resif 4 dk (Atlantik ringası, morina, alabalık; 5–7 balık), Buzdağı Kenarı 6 dk (Kutup kefali, alabalık, kalkan şansı; 1 seferden sonra), Batık Gemi 8 dk (garantili hazine kasası ve fener parçası, %30 dekorasyon parçası, günlük sayfası bir kez; 2 seferden sonra), Uzak Ada 10 dk (kilitli, "Fener onarılınca… Yakında").
- **Ganimet:** derin balıklar (rafa; dolarsa iskele kasalarına, kasalar raf boşaldıkça rafı doldurur, hiçbir şey kaybolmaz), hazine coin'i (iskele coin yığınına), fener parçası, nadir yem (120 sn), dekorasyon parçası (en ucuz açık dekorasyon çerçevesinin yarısını öder). Derin balıklar dönüşte ansiklopediye kaydedilir.
- **Olaylar** (%35 şans, cezasız): fırtına (süre +%25), buzdağı sürtmesi (ganimet −%15), şanslı akıntı (süre −%20), martı sürüsü (+2 balık). Olay çıkışta belli olur, panelde ve şeritte görünür.
- **Tekne görseli:** Kaydedilmez; her karede seferin kalan süresinden kurulur. İlk 7 sn iskeleden ayrılıp rota boyunca açılır, son %40'ta sise karışıp kaybolur; son 7 sn aynı yoldan geri gelir, yanaşırken burnunu döndürür. Kamera çıkışta ~2 sn tekneyi izler, sonra oyuncuya döner. Dönüşte boru sesi, sıçrama, hazine coin'leri yığına uçar, "Tekne döndü!" şeridi.
- **Süre gerçek zamanlıdır** ve oyun kapalıyken de akar: açılışta / arka plandan dönüşte geçen süre kadar ilerler (kısa yokluklar dahil). Biten sefer ganimetini rafa koyar ve "Sen yokken" penceresine tek satır ekler ("Tekne döndü: N balık rafta, X coin kasada"; birden fazlaysa "N kez döndü"). Bu coin'ler pencerenin coin'ine eklenmez (yığında durur), böylece çift sayım olmaz. Bir sefer yalnızca bir kez biter (`finishVoyage` seferi siler). Çevrimdışında otomatik sefer en fazla 1 kez yeniden çıkar (`VoyageRules.offlineAutoVoyages`), saat akmadığı için gece gecikmesi olmaz.
- **Dev balık fırsatı:** Dönüşte %25 şansla iskele ucunda şamandıralı "dev balık işareti" çıkar (3 dk). Güvertenin ucunda durunca mevcut mini oyun başlar; balık Kutup kefali ya da Grönland köpekbalığıdır, ağırlığın üst ucunda ve dövüşü ×1.45 zor. Tutulursa balık sırta, 30–60 coin iskele yığınına. Atlanırsa ceza yok.
- **Otomatik sefer:** Tekne seviye 3'te açılır, ayarı sefer panelindedir (varsayılan açık). Tekne döndükten 6 sn sonra son hedefi tekrarlar (erzak parası yetiyorsa).

**Derin deniz türleri:** Atlantik ringası (0.3–1.1 kg, 8 coin/kg), Kutup kefali (2–6 kg, 2.6 coin/kg), Grönland köpekbalığı (40–110 kg, 1.1 coin/kg, çok nadir). Yalnızca sefer ganimeti ve dev balık; oltaya ve ağa çıkmaz, altın/gökkuşağı varyantı yok. Tütsülenebilir (×2.5), tezgâhta satılır.

**Foklar (C4)**
- Penguen Pazarı paneline "Fok" sekmesi (tekne onarılınca görünür). Her oyun günü 2–3 aday, ücretsiz yenileme (3 dk bekleme). Balıkçı fok (ganimet miktarı +%25, 240), Kaşif fok (nadir tür, hazine, parça ve yem şansı +%40, 280); her fok bir öncekinden ×1.35 pahalı. Foklar kulübe yeri tüketmez; sayıları teknenin mürettebat yeri kadardır. Alınan fok mürettebata seçili gelir.
- Model (`createSeal`): yuvarlak gri fok, bıyıklar, renkli atkı. Seferdeyken teknede oturur; değilse iskele kenarında denizden kafa uzatır, oyuncuya bakar, sıçratarak dalar.

**Rıhtımcı (C5):** Penguen rolü (§24 tablosu). Ganimet rafından tütsühane girişine (yer varsa), yoksa tezgâha taşır. Yol grafiği: meydandan güney geçidine, iskele tapusuyla açılan kenar, raf düğümü. Çevrimdışında Rıhtımcı sayılmaz: ganimet rafta bekler, oyuna dönünce taşınır.

**Kayıt (v7):** `harbor` nesnesi: tekne yükseltmeleri, denizdeki sefer (hedef, kalan ve toplam süre, mürettebat, olay, gece gecikmesi), son hedef, son dönüş özeti, raf ve kasalar, iskele coin yığını, foklar ve fok kataloğu, seçili mürettebat, fener aşaması ve parçalar, otomatik sefer ayarı, sefer sayısı, batık sayfası, dev balık süresi, sezon kartı. Onarım aşamaları kilit id'leridir (`boatHull/Sail/Cabin`). Tekne animasyonu kaydedilmez. v6 → v7 göçü varsayılan iskeleyi verir; bozuk alanlar tek tek varsayılana döner.

**Testler:** `npm run test:panels -- harbor` (gerçek oyunda: panel halkada açılıyor, "Çık" sefere gönderiyor, tekne yükseltmesi, yürüyünce kapanma, dönüşte raf doluyor, 10 dk çevrimdışında 2 dk kalan sefer bir kez bitiyor ve tekrar kontrolde çift sayılmıyor, Rıhtımcı raftan taşıyor, rafın yanında ganimet sırta uçuyor, Fok sekmesinden fok alınıyor). `cycles` sefer panelini de her yoldan kapatıyor.

## Şu anki durum (2026-11-10, Demo 7C)
**Bitti**
- Demo 7A ve 7B main'de. Demo 7C ön işi: çevrimdışı verim üst değeri %65 → %60, `offlineMinerFactor` kaldırıldı; sim'de uç durum %39 (§18).
- Demo 7C **C-I (C1–C5)**: Liman İskelesi, tekne onarımı ve yükseltmeleri, sefer sistemi (çevrimdışı dahil), derin deniz türleri, foklar, Rıhtımcı, save v7 (§25). `test:panels -- harbor` 15/15, `cycles` sefer paneliyle 25/25.

**Sıradaki adım**
- C-II (C6–C11): fener ve fener paneli, sezon kartı, günlük 7–10, ansiklopedi ve siparişler, iskele müziği, sim ve denge.

## 17. Açık sorular
- Test için kullanılacak telefon: iPhone mu, Android mi? (Web demolarında fark yok, native aşamada önemli)
- Gelir modelinin kesinleşmesi (çevrimdışı "x2" düğmesi gizli bir yer tutucu olarak hazır)
- Ayı tüyünün kullanımı (şimdilik yalnızca sayılıyor; dekorasyon ya da huzurla bağlanabilir)
- Kalite otomatik seçilmeli mi? Şimdilik varsayılan Orta, yavaş cihaza yalnızca bir kerelik öneri var.
- Gerçek müzik parçası gerekecek mi? Şimdilik her şey sentez; `MusicDirector.loadTrack(url)` kancası hazır.
- **3. penguen zamanı (Demo 7B):** Sim'de ~34 dk (hedef ~40). Bot "en ucuz karşılanabilir hedef" kuralıyla alıyor; kulübe 2. seviye fiyatı 360'ın altındayken kamp tapusundan önce (~34 dk), 380 ve üstündeyken kamp çadırlarından sonra (~46–50 dk) alınıyor, arası yok. 300 seçildi (hedefe daha yakın). Gerçek oyuncu farklı sıralayabilir; telefonda bakılmalı.
- Uyku buff'ının etkisi 8 koşulu sim'de %12.9 çıktı (hedef ≤ ~%12, önceki ölçüm %10); koşu sayısına bağlı oynuyor, 7B ona dokunmadı.
- Temizlikçi ve Bekçi sim'de kullanılmıyor (bot tehdit yapılarını da almıyor); etkileri yalnızca oyunda ve panel testinde ölçüldü.

**Demo 6C'de kapananlar:** PWA PNG ikonları eklendi. Ses kaynakları sorusu kapandı (dosya yok, WebAudio sentezi). Diller Türkçe + İngilizce olarak kaldı. Ayarlarda "Sessiz" düğmeleri dil seçimini bozuyordu (seçici hatası), düzeltildi. Ayarlar kartı artık HUD düğmelerinin üstünde açılıyor.

## 17.1 Uygulama kuralları
Demolar sırasında verilen ve kalıcılaşan kararlar (eskimiş geçici kararlar silindi).

**Kamera ve görsel**
- ~50° eğim ve 35° FOV ile ufuk görünmez. Gökyüzü gradyanı sis rengiyle eşlenir; daha çok gökyüzü istenirse eğim ~40°'ye indirilmelidir.
- Balıklar okunabilsin diye gerçek oranlarından büyük çizilir (`fish.ts` → `length`).
- Statik modeller tek bir vertex renkli mesh'e "bake" edilir. Tekrar eden nesneler (balık, coin, alev, ayak izi, kar yığını, kristal, tabak, buhar) InstancedMesh kullanır.
- Ölçülen en kalabalık sahneler ~100 draw call ve ~30k üçgende kalır (ayı + yapılar, iglo 4 + dekorasyonlar, mağara, kamp).

**Kontroller**
- Masaüstünde WASD / ok tuşları yürütür, Space ekrana basılı tutmaya karşılık gelir.
- Balık tutma ve kristal damarı dokunuşları joystick'ten önce alır; 40 px sürükleme yürümeye geçer.
- iOS Safari `navigator.vibrate` desteklemez; iPhone'da titreşim native aşamada (Capacitor Haptics) gelecek. Ayarlardaki "Titreşim" anahtarı tüm titreşimleri kapatır.
- iOS çift dokunma zoom'unu engelleyen kural metin kutularına uygulanmaz.

**Rehber ok ve arayüz**
- Rehber ok her zaman karşılanabilir en ucuz kilit alanını gösterir; yoksa en ucuz olanı. Yığın dolunca tezgâhı gösterir (kristal taşınıyorsa kristal tezgâhını). Tehdit yapıları ve günlük sayfaları hedef olmaz.
- Kilit alanının üstünde ne açılacağı yazar ("Balık ağı", "Tapu: Buz Mağarası"...). Para akmadan önce ~0.3 sn durmak gerekir; üstünden yürümek para harcatmaz.
- "Yeni tür!" kartı yalnızca yaygın olmayan türlerde çıkar (morina ve üstü, gece balıkları dahil). Kapelin sessizce "görülmüş" sayılır.
- Ayarlar ve karakter dışındaki paneller açıkken oyun sürer; yalnızca karakter ekranı oyunu durdurur. Dil değişince oyun kaydedilip yeniden yüklenir.
- Katman sırası: HUD < ayarlar kartı < banner < çevrimdışı penceresi < kalite önerisi < splash.
- Bir olay tek titreşim verir: 70 ms içinde gelen ikinci titreşim düşer. Kilit açılınca önce yapının kendi deseni (iglo, dekorasyon) çalar, genel kilit deseni ancak o yoksa çalar.

**Karakter**
- Atkı "yok" `scarfColor = -1`'dir; atkı yokken boyunda mont renginde bir yaka görünür. Kukuletanın ayrı rengi yoktur, mont rengini alır.
- Yeni oyunda karakter iglonun kapısının önünde başlar (giriş sahnesi için). Karakter düzenlemede × değişiklikleri atar.

**Ekonomi ve simülasyon**
- "5 seviye" = Sv1 (başlangıç) + 4 satın alma. Fiyat taban × 1.6^(seviye − 1) × `priceScale`.
- Misina, çekiş gücünü böler; gösterge ölçeği değişmez.
- Müşteriler tezgâhtan rastgele eşya alır, boşalan yere son eşya geçer.
- Simülasyon botu verimli bir oyuncudur (tepki 0.3 sn, yürüyüş 1.2× düz çizgi + karar başına 1 sn). Yükseltme alan bot her açılıştan sonra en fazla bir yükseltme alır (sonraki hedefin %30'undan ucuzsa).
- Bahşiş kesirleri birikir ve 1 coin olunca ödenir.

**Dünya**
- Tütsühane bölgesine batıdaki ağaç kuşağında tek bir geçitten girilir.
- Yamaç köşesi: tütsühane bölgesinin batısındadır. Çığ koridoru 3. deliğe giden yolu keser ama penguenlerin yolunu kesmez. Mağara koridorun güneyindedir.
- Kamp, ana kıyının doğusundaki kara parçasındadır (buz köprü). Çevresindeki su çarpışmalarından ayı yüzerek geçer.
- Mağara ve kampın kendi coin yığınları vardır. Heykelcik ve tabak sırtta taşınmaz; sırtta yalnızca kristal taşınır (balıkla aynı kapasite).
- Penguenler balık, kristal (Madenci) ve tabak (Mutfakçı) taşır; heykelcik taşımaz (Koleksiyoncu raftan alır).

**Tehditler, uyku ve hikâye**
- Ayıyı korkutmak için joystick parmağı (ya da Space) basılıyken 3 birim yaklaşılır; parmak kalkınca dolum sıfırlanır. Meşale varken basılı tutmak gerekmez.
- Hedefin 12 birim yakınındaki her ateş çukuru ayı şansını ×0.6 yapar; uyarı bonusu çukur sayısıyla artmaz.
- Kar yığınlarını Temizlikçi (yoksa Taşıyıcı) kazar: önce raflara bakan "kapı" yığını, sonra koridor boyunca doğudan batıya; her yığında tek penguen. Çığ sandığı coin verir.
- Uyku günün %64'ünden gece yarısına kadar mümkündür, uyanış günün %3'ündedir. Buff o günün sonuna kadar sürer. Ayı uyarısı/yaklaşması ve çığ uyarısı uykuyu engeller. Uyanınca yeni gün 90 sn sessiz başlar.
- Tütsühanesi açık eski kayıtlarda 1. günlük sayfası ilk açılışta gelir.
- Test anahtarı `DebugSettings.debugForceThreat` ('bear' / 'avalanche') commit'lerde 'off' kalır.

**Kayıt (v7; iskele alanları §25)**
- Kaydedilir: oyuncu konumu, görünüm, ilerleme (`unlocked`, `regions`), istasyon içerikleri (tezgâh, sepet, tütsühane, mağara ve mutfak rafları, kristal damarlarının dolma süreleri), penguenler (ad, rol, özellik, seviye, deneyim, görünüm, fiyat, taşıdıkları), kulübe seviyesi, Pazar kataloğu ve yenileme süresi, yükseltmeler (olta + istasyon), saat ve gün toplamları, buff'lar, meşale / yem / ayı tüyü, iglo seviyesi, dekorasyonlar, uyku bilgisi, günlük sayfaları, Koleksiyoncu'ya kalan süre, ayarlar ve çevrimdışı hesap için son görülme zamanı.
- Kaydedilmez: müşteriler, turistler, NPC konumları, aktif ayı ve çığ, kar yığınları, sandık, uyku animasyonu, uçuştaki coin'ler. Uçuştaki balıklar inmiş sayılır.
- Her sürüm bir öncekine göç eder; eksik ya da bozuk alanlar tek tek varsayılana döner.
