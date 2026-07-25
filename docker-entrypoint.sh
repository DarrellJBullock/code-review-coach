#!/bin/sh
set -e

if [ "$SERVICE_ROLE" = "worker" ]; then
  echo "Starting worker process..."
  exec node apps/api/dist/worker.main.js
fi

echo "Running database migrations..."
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "Starting API process..."
exec node apps/api/dist/main.js
