#!/bin/sh
# NFR-7: щоденна резервна копія. Cron: 0 3 * * * /шлях/scripts/backup.sh
# Відновлення: gunzip -c backups/energycrm-ДАТА.sql.gz | docker compose exec -T db psql -U energycrm energycrm
set -e
mkdir -p backups
docker compose exec -T db pg_dump -U energycrm energycrm | gzip > "backups/energycrm-$(date +%F).sql.gz"
find backups -name 'energycrm-*.sql.gz' -mtime +30 -delete
