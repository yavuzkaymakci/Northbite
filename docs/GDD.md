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

## 3. Karakter oluşturma (ilk açılış)
- **Ekran:** Ortada döner bir önizleme modeli, altta seçenek şeritleri bulunur.
- **Seçenekler:**
  - İsim (en fazla 12 karakter)
  - Ten tonu (6 seçenek)
  - Mont rengi (8 seçenek)
  - Başlık: bere, kürk şapka veya kukuleta
  - Sakal: yok, kısa veya uzun
  - Atkı rengi
- **"Rastgele" butonu** ve **"Başla"** butonu
- **Teknik:** Model parçalı low-poly yapıdadır, renk değişimi materyal rengiyle yapılır. Görünüm save'e `appearance` objesi olarak yazılır.
- **Hassasiyet:** Yerleşim hayalî bir kuzey kasabasıdır. Gerçek yerli halkları stereotip biçimde tasvir eden kıyafet veya isimler kullanılmaz.

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

**Buz Kıyısı + Tütsühane bölgesi yerleşimi (Demo 3):** Kuzey ve doğu deniz. Tütsühane bölgesi batıda, bir ağaç kuşağının arkasında; kuşaktaki tek geçit buz duvarıyla kapalı. İçinde tütsühane ve 3. buz deliği kilit alanları var. Penguen kulübesi merkezde (iglonun güneyinde) kalır; 2. penguen kilit alanı da kulübenin yanındadır. Güneydeki ağaç kuşağında açılmayan ikinci bir buz duvarı durur: arkasında bulanık bir iskele silüeti ve "Yakında" tabelası (bölge 3'ün habercisi, işlevi yok).

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

**Penguen (Demo 3):**
- "Penguen kulübesi" kilit alanıyla ilk penguen gelir; kulübenin yanındaki ikinci kilit alanı 2. penguendir (tütsühaneden sonra görünür).
- İş önceliği:
  1. Tütsühane çıkışında tütsülenmiş balık varsa → tezgâha taşı.
  2. Tütsühane açıksa ve girişte yer varsa: sepetteki çiğ balığı → tütsühaneye taşı.
  3. Değilse sepetteki çiğ balığı → tezgâha taşı.
  4. Yapacak iş yoksa kulübenin önünde bekler (ara sıra kanat çırpar, etrafına bakar).
- Taşıma 3, hız 2.6 birim/sn (oyuncu 4.0). Değerler `src/content/workers.ts`.
- Yol bulma: `zones.ts` içinde waypoint grafiği, A* ile; bazı kenarlar yalnızca ilgili bölge açılınca kullanılır. Yerel kaçınma = statik engellerden itilme. Penguenler oyuncunun ve birbirlerinin içinden geçebilir.
- Birden fazla penguen aynı balıkları hedeflemesin diye kaynak ve hedeflerde "ayırma" yapılır.
- Görsel: low-poly penguen, iki yana sallanan paytak yürüyüş, sırtında küçük yığın. Konumları kaydedilmez; açılışta kulübeden başlarlar (taşıdıkları balıklar kaydedilir).

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
| Buz duvarı → Tütsühane bölgesi | 140 | ~10 dk | 9:48 |
| Tütsühane | 160 | 12–15 dk | 14:23 |
| 3. buz deliği | 220 | 15+ dk | 19:09 |
| 2. penguen (tütsühaneden sonra) | 300 | 15+ dk | 23:58 |

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
- Coin sayacı sayarak artar.

**Modeller:** Önce tamamen kodla üretilir. İleride gerekirse ücretsiz CC0 low-poly paketler (ör. Kenney, Quaternius) veya Blender ile glTF modellerine geçilir.

## 10. Kayıt, ses, gelir modeli
- **Kayıt:**
  - Otomatik olarak her 10 saniyede, kilit açıldığında ve arka plana geçişte yapılır.
  - Save verisinde sürüm numarası tutulur (`saveVersion`) ve ileriye dönük göç (migration) fonksiyonu yer alır.
- **Ses (Demo 5):** Balık tutma "plop" sesi, coin sesi, kilit açılma sesi, rüzgâr ambiyansı ve sakin bir müzik.
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

### Demo 2 — Karakter ve kayıt
- Karakter oluşturma ekranı, kaydetme ve yükleme, ana ekrana ekleme (PWA)
- **Kabul kriteri:** Uygulama kapatılıp açılınca her şey yerinde olur.

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

### Demo 4 — İlerleme
- Çevrimdışı gelir ("sen yokken" penceresi), tezgâh kapasitesi ve penguen yükseltmeleri, ekonominin ince ayarı

### Demo 5 — Cila
- Ses, titreşim, efektler, kamera gezdirme, iskele bölgesinin ilk hali

### Demo 6 — Native
- Capacitor ile Android APK
- iOS (Mac + Xcode gerekir; TestFlight için Apple Developer üyeliği gerekir)

## 12. Açık sorular
- Test için kullanılacak telefon: iPhone mu, Android mi? (Web demolarında fark yok, native aşamada önemli)
- Gelir modelinin kesinleşmesi
- Müzik ve ses kaynakları (ücretsiz paket mi, satın alma mı)
- Desteklenecek diller (varsayılan: Türkçe + İngilizce)

### Demo 0 sırasında verilen geçici kararlar
- **Gökyüzü görünürlüğü:** ~50° eğim ve 35° FOV ile kamera ufku hiç görmüyor. Gradient gökyüzü arka plan olarak kuruldu ve sis rengiyle eşlendi, ama ekranda çoğunlukla sisli su görünür. Gökyüzü daha çok görünsün isteniyorsa eğim düşürülmeli (ör. 40°).
- **His ayarları dosyası:** Kamera, joystick, sis, kar ve kayıt aralığı gibi denge dışı ayarlar `src/settings.ts` içinde tutuluyor.
- **Klavye:** Masaüstünde test için WASD / ok tuşları da karakteri yürütür.
- **İkon:** Şimdilik yalnızca SVG ikon var. iOS ana ekran ikonu için PNG (180×180) ve Android için 192/512 PNG'ler Demo 2'de (PWA) eklenecek.
- **Kayıt:** Demo 0'da yalnızca oyuncu konumu kaydediliyor (her 10 sn'de ve arka plana geçişte).

### Demo 1 sırasında verilen geçici kararlar
- **Rehber oku:** Açıklama metni olmadan döngünün anlaşılması için bir sonraki hedefin üstünde zıplayan sarı bir ok var (delik → tezgâh → coin yığını → karşılanabilir kilit alanı). Yığın dolunca her zaman tezgâhı gösterir.
- **Müşteriler kaydedilmez:** Kuyruktaki müşteriler ve yoldaki balıkları yeniden açılışta sıfırlanır. Tezgâhtaki, sırttaki ve yerdeki coin yığını kaydedilir.
- **Tezgâh kapasitesi:** 12 balık (iki kat). "Tezgâh kapasite yükseltmesi" Demo 4'e kaldı.
- **Balık model boyutu:** Okunabilirlik için balıklar gerçek oranlarından büyük çiziliyor (`fish.ts` içindeki `length`).
- **Alabalık süresi:** Saf sarma süresi 5 sn; çekişlerde bırakmakla birlikte toplam süre ~8–9 sn oluyor. Uzun gelirse `reelTime` düşürülebilir.
- **Masaüstü:** Space tuşu ekrana basılı tutmaya karşılık gelir (vuruşta basmak = dokunmak).
- **Titreşim:** iOS Safari `navigator.vibrate` desteklemiyor; iPhone'da titreşim native aşamada (Capacitor Haptics) gelecek.

### Demo 3 sırasında verilen geçici kararlar
- **Seviye sayımı:** "5 seviye" = Sv1 (başlangıç) + 4 satın alma. Böylece sırt çantası 5 → 6 → 7 → 8 → 10 olur ve kalkan, 2 yem alımından sonra (Sv3) havuza girer.
- **Misina etkisi:** "Gerilim tavanı" çekiş gücünü bölerek uygulanır; gösterge ölçeği değişmez (oyuncu aynı yeşil/sarı/kırmızı bölgeleri görür).
- **"Yeni tür!" kartı:** Yalnızca kalkan için değil, her türün ilk yakalanışında çıkar (ilk kapelin dahil).
- **Kalkan ayarı:** Sarma 8 → 6 sn, çekiş aralığı 1.3–2.3 sn, güç 0.9. Eski değerlerle kalkan pratikte tutulamıyordu.
- **Bölge kapısı:** Tütsühane bölgesi batıdaki ağaç kuşağında tek bir geçitten açılıyor; uzun bir duvar yerine kısa, okunaklı bir duvar.
- **Kilit alanına girme gecikmesi:** Para akmadan önce ~0.3 sn durmak gerekiyor; üstünden yürüyerek geçmek para harcatmıyor.
- **Kilit alanı etiketi:** Fiyatın üstünde ne açılacağı yazıyor ("Balık ağı", "Buz duvarı"...).
- **Müşteriler tezgâhtan rastgele eşya alıyor;** boşalan yere son eşya geçiyor (yalnızca bir balık yer değiştiriyor).
- **Bot hızı:** Simülasyondaki bot verimli bir oyuncudur (tepki 0.3 sn, yürüyüş 1.2× düz çizgi + karar başına 1 sn). Gerçek oyuncular biraz daha yavaş olabilir; ilk testlerden sonra fiyatlar %10–15 düşürülebilir.
- **Yükseltme alan bot:** Her açılış arasında en fazla bir yükseltme alıyor (sonraki hedefin %30'undan ucuzsa). Bu bot hedeflere ~0.5–1 dk geç ulaşıyor; yükseltmeler ekonomiyi hızlandırmaktan çok mini oyunu kolaylaştırıyor.
- **Penguen kulübesi** merkezde kaldı (iglonun güneyi); 2. penguen kilit alanı tütsühane açılınca kulübenin yanında beliriyor.
- **Çizim maliyeti:** Statik modeller (iglo, tezgâh, kulübe, tütsühane, olta tezgâhı, sepet, iskele) tek bir vertex renkli mesh'e "bake" ediliyor. En kalabalık görünümde ~91 draw call, ~25k üçgen.
