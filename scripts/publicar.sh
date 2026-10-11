#!/usr/bin/env bash
# Copia Cofre del repo privado al público (cofre-app), sin notas de trabajo ni datos personales.
#
# Uso:  scripts/publicar.sh <carpeta del repo público> ["mensaje del commit"]
#   Los commits del público siempre salen como «Humano» con el correo privado de GitHub.
#   1. Copia lo que git sigue en el privado, menos lo de EXCLUIR.
#   2. Se detiene si encuentra alguna palabra de .cofre-privado.
#   3. Hace un commit en el público (no lo sube: revisa y luego `git push`).
set -euo pipefail

PRIVADO="$(cd "$(dirname "$0")/.." && pwd)"
PUBLICO="${1:?Uso: scripts/publicar.sh <carpeta del repo público> [\"mensaje\"]}"
MENSAJE="${2:-Actualiza Cofre}"
LISTA="$PRIVADO/.cofre-privado"
EXCLUIR=(ESTADO.md .cofre-privado)

[ -f "$LISTA" ] || { echo "Falta $LISTA (lista de palabras privadas)."; exit 1; }
[ -d "$PUBLICO/.git" ] || { echo "$PUBLICO no es un repo de git."; exit 1; }
[ -z "$(git -C "$PRIVADO" status --porcelain)" ] || { echo "El repo privado tiene cambios sin commit: haz commit primero."; exit 1; }

# 1. Archivos a publicar: los que sigue git, menos los excluidos.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git -C "$PRIVADO" ls-files -z > "$TMP/todos"
for e in "${EXCLUIR[@]}"; do printf '%s\0' "$e"; done > "$TMP/fuera"
python3 - "$TMP/todos" "$TMP/fuera" > "$TMP/lista" <<'PY'
import sys
todos = open(sys.argv[1], 'rb').read().split(b'\0')
fuera = set(open(sys.argv[2], 'rb').read().split(b'\0'))
sys.stdout.buffer.write(b'\0'.join(f for f in todos if f and f not in fuera))
PY

# 2. Revisión de palabras privadas antes de copiar.
grep -v -E '^\s*(#|$)' "$LISTA" > "$TMP/palabras"
if (cd "$PRIVADO" && xargs -0 grep -I -n -i -w -F -f "$TMP/palabras" < "$TMP/lista"); then
  echo; echo "✋ Hay datos privados en los archivos de arriba. No se publicó nada."; exit 1
fi

# 3. Reemplaza el contenido del público (conserva su .git) y hace commit.
find "$PUBLICO" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
(cd "$PRIVADO" && xargs -0 tar -cf - < "$TMP/lista") | tar -C "$PUBLICO" -xf -
git -C "$PUBLICO" add -A
if git -C "$PUBLICO" diff --cached --quiet; then echo "Sin cambios para publicar."; exit 0; fi
# Autor fijo y anónimo: el nombre y el correo de quien publica nunca quedan en el historial público.
GIT_AUTHOR_NAME="Humano" GIT_AUTHOR_EMAIL="83187739+Maggi3Mae@users.noreply.github.com" \
GIT_COMMITTER_NAME="Humano" GIT_COMMITTER_EMAIL="83187739+Maggi3Mae@users.noreply.github.com" \
  git -C "$PUBLICO" commit -q -m "$MENSAJE"
echo "✓ Commit hecho en $PUBLICO. Revisa con 'git -C $PUBLICO show --stat' y súbelo con 'git -C $PUBLICO push'."
