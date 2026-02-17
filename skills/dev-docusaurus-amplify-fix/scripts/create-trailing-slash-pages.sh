#!/bin/bash
# Create page/index.html copies for all .html files in the docs build
# This makes trailing slash URLs work without needing redirects

BUILD_DIR="build"

echo "Creating trailing slash page copies..."

# Find all .html files except index.html files
find "$BUILD_DIR" -name "*.html" ! -name "index.html" -type f | while read html_file; do
  # Get the directory and filename
  dir=$(dirname "$html_file")
  filename=$(basename "$html_file" .html)
  
  # Create a directory with the same name as the file
  page_dir="$dir/$filename"
  mkdir -p "$page_dir"
  
  # Copy the HTML file as index.html in that directory
  cp "$html_file" "$page_dir/index.html"
  
  echo "Created: $page_dir/index.html"
done

echo "Done!"
