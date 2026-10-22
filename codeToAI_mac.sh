#!/bin/bash

OUTPUT_FILE="all_code_mac.txt"

> "$OUTPUT_FILE"

find src -type f \( -name "*.kt" -o -name "*.sq" -o -name "*.kts" \) | while read -r file; do
  echo -e "\n========== FILE: $file ==========\n" >> "$OUTPUT_FILE"
  cat "$file" >> "$OUTPUT_FILE"
done

echo "Done: $OUTPUT_FILE"