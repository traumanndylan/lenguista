@echo off
echo Reiniciando el servidor
docker restart lenguista-video lenguista-classroom lenguista-frontend
echo Servidor reiniciado correctamente
timeout /t 2
