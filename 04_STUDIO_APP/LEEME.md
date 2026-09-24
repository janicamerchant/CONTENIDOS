# Estudio de Carruseles

App local para pedir y armar carruseles de EVA, Janica Merchant y City Kia.

## Abrir

Doble clic en **Iniciar Estudio.command**, o en Terminal:

```
cd ~/Desktop/CONTENIDOS/04_STUDIO_APP && ruby server.rb
```

Luego abre http://localhost:4321. Usa el Ruby que ya trae macOS; no hay que instalar nada. Las fuentes y la librería de exportación se cargan de internet.

## Qué hace

- **Solicitudes**: formulario de brief (el mismo formato del manual). Cada solicitud se guarda en `05_SOLICITUDES/` como `.md` y `.json`.
- **Borrador con IA** (opcional): con una API key de Anthropic en Ajustes, Claude Opus 5 lee el perfil de marca y el flujo de producción y arma los textos de cada lámina. Las cifras que haya que confirmar salen marcadas con [VERIFICAR].
- **Editor**: láminas 1080 × 1350 con seis diseños (portada, cifra, frase, lista, comparar, CTA), fondo claro u oscuro, fotos de la biblioteca o subidas, logos oficiales y la guía de zona segura.
- **Exportar**: PNG a `03_ENTREGAS/<MARCA>_<proyecto>/`, en 1080 × 1350 o 2160 × 2700.
- **Entregas**: galería de todo lo que hay en `03_ENTREGAS/`.

Los proyectos se guardan solos en `data/proyectos/`; las imágenes subidas, en `data/uploads/`.

## Pendientes de marca

- El rojo de City Kia (`#D7141A`) es provisional: el perfil no define un HEX. Se cambia en `public/slides.css`.
- La lima de EVA (`#ECFE6E`) está tomada directamente del logo oficial.
