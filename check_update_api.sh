#!/bin/bash

# Get from .env.local or package.json scripts
SUPABASE_URL="https://vnxmsmzkmikqyqhbtlpo.supabase.co"
SUPABASE_ANON_KEY=$(grep -o 'VITE_SUPABASE_ANON_KEY="[^"]*' vite.config.js | cut -d'"' -f2)

if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "Error: Could not find SUPABASE_ANON_KEY"
  exit 1
fi

curl -s -X GET \
  "$SUPABASE_URL/rest/v1/portal_actualizaciones?id=eq.75" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" | jq '.'
