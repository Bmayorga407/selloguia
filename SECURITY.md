# Seguridad de SelloGuia

SelloGuia procesa PDFs, timbres, historial y base de camiones en el equipo local. La version de escritorio esta configurada para bloquear conexiones externas por HTTP, HTTPS, WebSocket y FTP.

## Flujo local

- Los PDFs se leen desde el equipo del usuario.
- El PDF sellado se genera en memoria como `Blob`.
- La impresion se abre desde ese `Blob` local, no desde un servidor externo.
- El historial queda en `IndexedDB` del navegador/app.
- La base de camiones queda en `localStorage` del navegador/app.
- Las librerias PDF.js, PDF-lib y GSAP se cargan desde la carpeta local `vendor/`.

## Bloqueos de la app de escritorio

La capa Electron en `electron/main.js`:

- bloquea solicitudes `http:`, `https:`, `ws:`, `wss:` y `ftp:`;
- bloquea navegacion externa;
- bloquea ventanas externas que no sean locales o `blob:`;
- desactiva integracion Node en la ventana;
- usa aislamiento de contexto y sandbox;
- aplica una politica de seguridad con `connect-src 'none'`.

## Que no debe subirse a este repo

- Guias de despacho reales, facturas, estados de cuenta o documentos de clientes.
- Timbres reales de la empresa.
- Archivos `.env`, claves, tokens, certificados o contrasenas.
- Planillas Excel, PDFs, Word, ZIPs o carpetas privadas.

## Protecciones locales

Este repo incluye:

- `.gitignore`, para que Git ignore documentos y secretos comunes.
- `.githooks/pre-commit`, para frenar commits con PDFs, Excel, Word, llaves, `.env` o posibles tokens.

Si el filtro bloquea un commit, lo normal es quitar ese archivo del commit. La app deberia seguir viviendo como HTML/CSS/JS publico.

## Recomendacion para GitHub

Mantener el repo como privado si solo sera de uso interno. Si se usa GitHub Pages publico, asumir que cualquier persona puede ver el codigo del sitio.
