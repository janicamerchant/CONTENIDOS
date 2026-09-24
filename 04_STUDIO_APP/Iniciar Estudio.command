#!/bin/bash
# Doble clic para abrir el Estudio de Carruseles en el navegador.
cd "$(dirname "$0")"
PORT=4321
if ! curl -s -o /dev/null "http://localhost:$PORT"; then
  /usr/bin/ruby server.rb &
  SERVER=$!
  sleep 1.5
fi
open "http://localhost:$PORT"
echo "Estudio abierto en http://localhost:$PORT — cierra esta ventana para apagarlo."
[ -n "$SERVER" ] && wait $SERVER
