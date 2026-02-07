
import re

def extract():
    with open('WTF.jsx', 'r') as f:
        content = f.read()

    # Extract IC
    ic_match = re.search(r'const IC = \{(.*?)\};', content, re.DOTALL)
    ic_content = ic_match.group(1) if ic_match else ""

    # Extract MOODS
    moods_match = re.search(r'const MOODS = \[(.*?)\];', content, re.DOTALL)
    moods_content = moods_match.group(1) if moods_match else ""

    # Extract DB
    db_match = re.search(r'const DB = \[(.*?)\];', content, re.DOTALL)
    db_content = db_match.group(1) if db_match else ""

    with open('src/data.js', 'w') as f:
        f.write("import React from 'react';\n\n")
        f.write(f"export const IC = {{{ic_content}}};\n\n")
        f.write(f"export const MOODS = [{moods_content}];\n\n")
        f.write("export const MOOD_MAP = {};\n")
        f.write("MOODS.forEach(m => { MOOD_MAP[m.id] = m; });\n\n")
        f.write(f"export const DB = [{db_content}];\n")

if __name__ == "__main__":
    extract()
