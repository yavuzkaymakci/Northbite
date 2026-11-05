# Northbite — Claude Code proje talimatları

## Proje
Dikey (portrait) ekranlı mobil **arcade-idle** oyunu. Low-poly 3D, kutup balıkçısı teması.
Oyuncu kendi karakterini oluşturur, buz deliğinden balık tutar, satar, alan açar, işçi tutar ve işleri otomatiğe bağlar.

- Tasarımın tek doğruluk kaynağı: `docs/GDD.md`
- Demo aşamaları ve kabul kriterleri: `docs/GDD.md` §11

## Teknoloji
- **TypeScript (strict) + Vite + Three.js**
- UI: canvas üzerine HTML/CSS katmanı (HUD, menüler, joystick görseli)
- **Fizik motoru yok.** Hareket XZ düzleminde; çarpışmalar daire–daire ve daire–dikdörtgen olarak elle yazılır.
- Kayıt: `SaveStore` arayüzü arkasında localStorage. İleride Capacitor Preferences'e geçilecek.
- Native paketleme (sonraki aşama): **Capacitor** (Android + iOS)

## Klasör yapısı
```
src/
  main.ts
  settings.ts  his ayarları: kamera, joystick, sis, mini oyun hissi (denge dışı değerler)
  core/      Game loop, Time, Input, SaveStore, EventBus
  render/    Renderer, CameraRig, Lighting, Palette
  world/     Map, Zones, Unlockables
  entities/  Player, Worker, Customer, Station, Item
  systems/   Movement, CarryStack, Economy, Spawning, OfflineEarnings
  ui/        Joystick, HUD, CharacterCreator, UpgradePanel, Popups
  content/   economy.ts, fish.ts, stations.ts, zones.ts, workers.ts, upgrades.ts, strings.ts
  models/    kodla üretilen low-poly mesh fabrikaları
public/      manifest.webmanifest, ikonlar, ileride glTF modeller
docs/        GDD.md
tools/       balance-sim.ts (denge simülasyonu; oyunun içerik ve mantık dosyalarını Node'da çalıştırır)
.github/workflows/deploy.yml   main'e her push'ta GitHub Pages yayını
```

## Kod kuralları
- Kod, değişken adları ve yorumlar İngilizce. Oyuncuya görünen metinler `src/content/strings.ts` içinde (tr + en).
- **Denge sayıları koda gömülmez.** Fiyat, hız, kapasite ve süre gibi değerler `src/content/` dosyalarından okunur. His/teknik ayarlar (kamera, joystick, mini oyun hissi, titreşim süreleri) `src/settings.ts` içindedir.
- Modeller şimdilik kodla üretilir: Box, Cone, Cylinder ve Icosahedron geometrileri, `flatShading: true` ile.
  - Her model `src/models/` altında ayrı bir fabrika fonksiyonudur (`createIgloo()`, `createPlayer(appearance)` gibi).
  - Böylece ileride glTF ile tek noktadan değiştirilebilir.
- Renkler yalnızca `render/Palette.ts` üzerinden kullanılır.
- Güncellemeler kare hızından bağımsızdır: delta time kullanılır, en fazla 0.1 sn ile sınırlanır.
- Oyun durumu (save'e giden veri) ile görsel nesneler ayrı tutulur. Kayıt yalnızca saf veriyi (JSON) yazar.

## Mobil performans bütçesi
- En fazla ~150 draw call ve ~100k üçgen
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`
- Tekrar eden nesnelerde (balık, kar, coin, ağaç) `InstancedMesh` kullanılır.
- Gerçek gölge yerine blob gölge (karakter altında yarı saydam daire) kullanılır.
- Işık: 1 hemisphere + 1 directional
- Antialias açık, post-processing yok (şimdilik)

## Dokunmatik ve tarayıcı ayarları
- Pointer events kullanılır; canvas üzerinde `touch-action: none` uygulanır.
- Pinch-zoom, çift dokunma zoom'u, uzun basmada metin seçimi ve bağlam menüsü kapalıdır.
- `visibilitychange` ile arka plana geçince oyun duraklatılır ve kaydedilir.
- Çentik ve güvenli alanlar için `env(safe-area-inset-*)` kullanılır.
- `manifest.webmanifest` içinde `display: "fullscreen"` ve `orientation: "portrait"` tanımlıdır.
- iOS için `apple-mobile-web-app-capable` meta etiketi eklenir.

## Komutlar
- `npm run dev` — yerel sunucu, `vite --host` ile aynı Wi-Fi'deki telefondan açılabilir
- `npm run build` — production build (`dist/`)
- `npm run preview` — build önizlemesi (`--host` ile)
- `npm run typecheck` — `tsc --noEmit`
- `npm run test:panels` — panel stres testleri (headless Chrome; kendi Vite sunucusunu açar). `-- --reduce-motion`, `-- --throttle 6` ve `-- cycles storm` gibi seçenekler alır (GDD §23).
- `npm run sim` — denge simülasyonu (açılış süreleri, boşta gelir, yükseltme etkileri); `npm run sim -- 20` koşu sayısını, `npm run sim -- 1 reel` yalnızca mini oyun tablolarını verir. Simülasyonun kullandığı mantık dosyaları (`ReelGame`, `FishRoll`, `StationLogic`, `WorkerBrain`, `Pathfinding`, `Upgrades`) Three.js ve DOM içermemeli.

## Telefonda test
1. **Hızlı test (aynı Wi-Fi):** `npm run dev` çalıştır ve terminaldeki "Network" adresini telefon tarayıcısında aç. Vite `base: '/Northbite/'` kullandığı için adres `/Northbite/` ile biter (ör. `http://192.168.x.x:5173/Northbite/`).
2. **Demo linki:** https://yavuzkaymakci.github.io/Northbite/ — `main` dalına her push'ta `.github/workflows/deploy.yml` build alıp GitHub Pages'e yayınlar. Telefonda "Ana Ekrana Ekle" denince uygulama gibi tam ekran açılır.
3. **Native (sonraki aşama):** Capacitor ile Android APK (Android Studio) ve iOS (Mac + Xcode) derlenir.

## Çalışma şekli
- Bir seferde tek bir demo aşaması üzerinde çalışılır.
- Aşama bitince `typecheck` ve `build` hatasız geçmeli, GDD'deki kabul kriterleri tek tek kontrol edilmiş olmalı.
- Her aşamanın sonunda kısa bir özet ve "telefonda şunları dene" listesi verilir.
- GDD'de karşılığı olmayan bir karar gerekirse en basit çözüm seçilir ve `docs/GDD.md` içindeki "Açık sorular" bölümüne not düşülür.
