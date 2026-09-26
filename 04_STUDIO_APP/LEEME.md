# Estudio de Carruseles

App local para pedir y armar carruseles de EVA, Janica Merchant y City Kia.

## Abrir

Doble clic en **Iniciar Estudio.command**, o en Terminal:

```
cd ~/Desktop/CONTENIDOS/04_STUDIO_APP && ruby server.rb
```

Luego abre http://localhost:4321. Usa el Ruby que ya trae macOS; no hay que instalar nada. Las fuentes y la librería de exportación se cargan de internet.

## Qué hace

- **Crear** (pantalla de inicio): describes la idea → Claude arma la propuesta de guion y dirección creativa (editable lámina por lámina) → la app muestra el costo aproximado en créditos de Higgsfield y en dólares de Claude → al aprobar, genera las fotos con la API de Higgsfield (GPT Image 2.5, calidad alta 2K), las guarda en `data/uploads/` y las pone en las láminas. Si la escena incluye a Janica, se envían sus referencias oficiales de cara. En EVA y Janica, cada foto sale además con su **recorte** (persona sin fondo, hecho gratis en la Mac con Vision de macOS, `tools/recorte.js`) para que el titular pase por detrás del sujeto. En el editor, el botón **Recorte automático** hace lo mismo con cualquier foto.
- **Cifras con fuente**: antes de escribir la propuesta, Claude investiga con búsqueda web (hasta 6 búsquedas) y solo usa cifras verificadas o los proof points aprobados. Cada lámina con un dato muestra "Fuente: …" (campo **Fuente del dato**, editable). La investigación completa, con enlaces, aparece en la propuesta. Nunca quedan marcadores como [VERIFICAR]. Una propuesta con investigación cuesta ~$0.40–0.70 de Claude.
- **Regenerar fotos**: en Crear, después de generar, cada lámina tiene **Regenerar esta foto** (puedes cambiar la escena o el prompt antes) y el panel tiene **Regenerar todas**. En el Editor, **Regenerar foto con Higgsfield** hace lo mismo con la lámina abierta. La foto anterior se guarda: **Volver a la foto anterior** la recupera (y vuelve a la nueva si lo pulsas otra vez).
- **Acabado EVA** (regla de la guía visual): fondo con textura siempre activo, papel rasgado en todos los diseños, pestaña rasgada en la esquina y adornos HUD en los bordes.
- **Marcas** (base de conocimiento): cada marca vive en `06_MARCAS/<marca>/` y se administra en la pestaña **Marcas**, sin tocar código.
  - **+ Nueva marca**: formulario manual o **Armar perfil con Claude** (describe la marca, con dictado por voz, y opcionalmente su web; Claude investiga y propone perfil, reglas, colores y tipografías, ≈ $0.15–0.40). Las marcas nuevas usan el diseño base con sus colores y tipografías de Google Fonts; EVA, Janica y City Kia conservan su diseño propio en `public/slides.css`.
  - En cada marca: identidad y valores por defecto, **reglas para Claude** (`reglas.md`), **conocimiento** (.md, .txt, .pdf), **datos verificados** con fuente, **referencias visuales** (Claude ve hasta 8 activas), **logos** y **personas aprobadas**. Cada recurso se puede activar/desactivar, etiquetar y eliminar; lo eliminado va a la **papelera** de la marca y se puede restaurar. Las marcas archivadas van a `06_MARCAS/_papelera/`.
  - **Documentos comunes** (`06_MARCAS/_comun/`): los lee Claude en todas las marcas.
  - **Personas aprobadas** (`06_MARCAS/_personas/`): fotos de cara en orden de prioridad y bloqueo de identidad. Si el guion nombra a una persona de la marca, sus fotos van a Higgsfield como referencia.
  - Un medidor muestra cuántos tokens suma la base de cada marca a una propuesta y su costo (con caché, la segunda propuesta seguida sale más barata).
  - El Estudio ya no lee `01_SKILL_OPERATIVO/references/` ni `assets/`: se copiaron a `06_MARCAS/` el 24-09-2026. Los cambios de marca se hacen en `06_MARCAS/`.
- **Solicitudes**: formulario de brief (el mismo formato del manual). Cada solicitud se guarda en `05_SOLICITUDES/` como `.md` y `.json`.
- **Borrador con IA** (opcional): con una API key de Anthropic en Ajustes, Claude Opus 5 lee el perfil de marca y el flujo de producción y arma los textos de cada lámina. Las cifras que haya que confirmar salen marcadas con [VERIFICAR].
- **Editor**: láminas 1080 × 1350 con seis diseños (portada, cifra, frase, lista, comparar, CTA), fondo claro u oscuro, fotos de la biblioteca o subidas, logos oficiales y la guía de zona segura.
- **Exportar**: PNG a `03_ENTREGAS/<MARCA>_<proyecto>/`, en 1080 × 1350 o 2160 × 2700.
- **Entregas**: galería de todo lo que hay en `03_ENTREGAS/`.

Los proyectos se guardan solos en `data/proyectos/`; las imágenes subidas y generadas, en `data/uploads/`.

## Credenciales

- **Higgsfield**: `04_STUDIO_APP/.env` con `HF_CREDENTIALS=id:secreto` (de cloud.higgsfield.ai). Los créditos de la API son un saldo aparte del plan de higgsfield.ai. El archivo está en `.gitignore`.
- **Higgsfield web (Nano Banana Pro 4K)**: las marcas con `"motor_imagen": "nano_banana_pro"` en `marca.json` (hoy Janica) generan con la herramienta oficial `~/bin/higgsfield`, que usa la sesión y los créditos del plan de higgsfield.ai (~4 créditos por foto 4K). La API no ofrece este modelo. Instalación: `curl -fsSL https://raw.githubusercontent.com/higgsfield-ai/cli/main/install.sh -o i.sh && sh i.sh --prefix "$HOME" --no-hf`, luego `~/bin/higgsfield auth login` y `~/bin/higgsfield workspace set <id>` (`workspace list` muestra el id). Cada computador que genere necesita su propia sesión.
- **Anthropic**: en Ajustes, o `ANTHROPIC_API_KEY=...` en el mismo `.env`.
- Tras cambiar el `.env`, reinicia el Estudio.

## Pendientes de marca

- El rojo de City Kia (`#D7141A`) es provisional: el perfil no define un HEX. Se cambia en `public/slides.css`.
- La lima de EVA (`#ECFE6E`) está tomada directamente del logo oficial.
