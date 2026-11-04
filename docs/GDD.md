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
2. Tutulan balıklar karakterin **sırtında üst üste yığılır** (taşıma kapasitesi kadar).
3. Oyuncu **satış tezgâhına** yürür, yükü tezgâha bırakır.
4. **Müşteriler** gelir, tezgâhtan balık alır ve yere **coin** bırakır.
5. Oyuncu coin'lerin üstünden geçerek parayı toplar.
6. Para, yerdeki **kilit alanlarına** harcanır: kesik çizgili çerçevenin üstünde durunca para akar, çerçeve dolunca yapı açılır.
7. Yeni istasyonlar, işçiler ve yükseltmeler açıldıkça oyuncunun elle yaptığı işler otomatiğe döner. Oyuncu da daha büyük hedeflere yönelir.

**Etkileşim kuralı:** Hiçbir istasyonda buton yoktur. İstasyonun etkileşim alanında durmak yeterlidir (türün standardı budur). Balık tutmadaki tek istisna, vuruşta ekrana dokunmak ve sarmak için basılı tutmaktır.

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
| Grönland kalkanı (dev) | 8–20 | ~8 sn | Çok sert, düzensiz | Kilitli (ileride olta yükseltmesiyle) |

- Tür içinde kg rastgeledir (küçükler daha sık). Büyük kg, sarma süresini ve çekiş gücünü en fazla %35 artırır.
- **Satış fiyatı** = kg × kg başına fiyat (yuvarlanır, en az 1 coin).

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

## 8. Ekonomi (başlangıç değerleri, ayarlanacak)
Tüm değerler `src/content/economy.ts` dosyasında tutulur.

| Değer | Başlangıç |
|---|---|
| Balık tutma | Mini oyun (§2.1); bir balık ortalama ~6 sn |
| Oyuncu taşıma kapasitesi | 5 |
| Oyuncu yürüme hızı | 4.0 birim/sn |
| Çiğ balık satış fiyatı | kg × kg başına fiyat: kapelin 15, morina 3, alabalık 2.5, kalkan 2 coin/kg (ortalama ~3 coin/balık) |
| Tezgâh kapasitesi | 12 balık |
| Müşteri gelme aralığı | 3–5 sn, her müşteri 1–3 balık alır |
| 2. buz deliği | 30 coin |
| Tezgâh kapasite yükseltmesi | 50 coin |
| İlk penguen | 75 coin |
| Tütsühane | 200 coin |
| Tütsülenmiş balık fiyatı | 8 coin (fırında 4 sn) |

- **Yükseltme fiyatları:** `taban × 1.15^seviye` formülüyle büyür.
- **İlk 15 dakika hedefi:** İlk 30 sn'de ilk satış, ~2 dk'da ilk kilit açılışı, ~6 dk'da ilk penguen, ~12–15 dk'da tütsühane açılmış olmalı.
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
- Penguen işçi, tütsühane (çiğ balığın tütsülenmiş balığa dönüşmesi), 3. delik
- **Kabul kriteri:** Oyuncu hiçbir şey yapmasa da para artmaya devam eder.

### Demo 4 — İlerleme
- Yükseltme paneli, çevrimdışı gelir, ekonominin ilk 15 dakikaya göre ayarlanması

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
