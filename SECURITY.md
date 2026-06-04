# Seguridad de SelloGuia

SelloGuia es una pagina estatica: los PDFs y timbres se procesan en el navegador y no se suben a un servidor del proyecto.

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

