# Northbite

Dikey ekranlı, low-poly 3D bir mobil **arcade-idle** oyunu. Kutup kıyısında tek bir olta ve bir igloyla başlayan balıkçı; buz deliğinden balık tutar, satar, yeni alanlar açar, işçi tutar ve işleri otomatiğe bağlar.

**Demo:** https://yavuzkaymakci.github.io/Northbite/ (telefondan açın; "Ana Ekrana Ekle" ile tam ekran çalışır)

## Teknoloji
TypeScript (strict) · Vite · Three.js. Fizik motoru yok, modeller kodla üretilir.
Tasarım dokümanı: [docs/GDD.md](docs/GDD.md)

## Komutlar
```bash
npm install
npm run dev        # yerel sunucu; aynı Wi-Fi'deki telefondan "Network" adresi + /Northbite/
npm run build      # production build -> dist/
npm run preview    # build önizlemesi
npm run typecheck  # tsc --noEmit
```

`main` dalına yapılan her push, GitHub Actions ile build alınıp GitHub Pages'e yayınlanır.
