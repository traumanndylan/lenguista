#!/bin/bash

echo "Restarting Server"

docker-compose stop backend-classroom backend-video frontend
docker-compose rm -f backend-classroom backend-video frontend
docker-compose up -d

echo "Server Restarted"
