#!/bin/bash

echo "Reiniciando el servidor"

docker restart lenguista-video lenguista-classroom lenguista-frontend

echo "Servidor reiniciado correctamente"

sleep 2
