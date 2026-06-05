#!/bin/bash
cd /home/z/my-project/services/pocketbase
./pocketbase serve --http=0.0.0.0:8090 &
echo "PocketBase started on http://localhost:8090"
echo "Admin UI: http://localhost:8090/_/"
